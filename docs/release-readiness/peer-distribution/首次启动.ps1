param([switch]$PrepareOnly)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$program = Join-Path $PSScriptRoot '程序'
$models = Join-Path $program 'resources\models'
$temporaryRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$work = Join-Path $temporaryRoot ('shortdrama-first-run-' + [Guid]::NewGuid().ToString('N'))
$components = @(
    @{ Name = 'ffmpeg.exe'; Hash = '04e1307997530f9cf2fe35cba2ca7e8875ca91da02f89d6c7243df819c94ad00'; Url = 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-win32-x64.gz'; Archive = 'gzip' },
    @{ Name = 'ffprobe.exe'; Hash = '4303ec85855340689b1f8aa5d9c1dc06ef3e3090682de3034edc3fca2b0798d5'; Url = 'https://registry.npmjs.org/ffprobe-static/-/ffprobe-static-3.1.0.tgz'; Archive = 'tar' }
)

function Test-Hash([string]$Path, [string]$Expected) {
    if (![IO.File]::Exists($Path)) { return $false }
    $stream = [IO.File]::OpenRead($Path)
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try {
        $actual = [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '')
        return $actual -eq $Expected
    } finally {
        $algorithm.Dispose()
        $stream.Dispose()
    }
}

function Expand-Component([string]$ArchivePath, [string]$Destination, [bool]$IsTar) {
    $inputStream = [IO.File]::OpenRead($ArchivePath)
    $gzip = New-Object IO.Compression.GZipStream($inputStream, [IO.Compression.CompressionMode]::Decompress)
    $outputStream = $null
    try {
        if (!$IsTar) {
            $outputStream = [IO.File]::Create($Destination)
            $gzip.CopyTo($outputStream)
            return
        }
        # Read only the exact regular file. Never extract archive paths to disk.
        $header = New-Object byte[] 512
        $buffer = New-Object byte[] 65536
        while ($true) {
            $offset = 0
            while ($offset -lt 512) {
                $count = $gzip.Read($header, $offset, 512 - $offset)
                if ($count -eq 0) { throw '下载归档不完整，请重新启动以重试。' }
                $offset += $count
            }
            $name = [Text.Encoding]::ASCII.GetString($header, 0, 100).Trim([char]0)
            if (!$name) { throw '下载归档中缺少指定的视频组件。' }
            $sizeText = [Text.Encoding]::ASCII.GetString($header, 124, 12).Trim([char]0, [char]32)
            $size = [Convert]::ToInt64($sizeText, 8)
            if ($size -lt 0 -or $size -gt 536870912) { throw '下载归档大小异常。' }
            $wanted = $name -eq 'package/bin/win32/x64/ffprobe.exe'
            if ($wanted -and $header[156] -ne 0 -and $header[156] -ne 48) { throw '视频组件不是普通文件。' }
            if ($wanted) { $outputStream = [IO.File]::Create($Destination) }
            $remaining = $size
            while ($remaining -gt 0) {
                $count = $gzip.Read($buffer, 0, [int][Math]::Min($remaining, $buffer.Length))
                if ($count -eq 0) { throw '下载归档内容不完整。' }
                if ($wanted) { $outputStream.Write($buffer, 0, $count) }
                $remaining -= $count
            }
            if ($wanted) { return }
            $padding = (512 - ($size % 512)) % 512
            while ($padding -gt 0) {
                $count = $gzip.Read($buffer, 0, [int]$padding)
                if ($count -eq 0) { throw '下载归档填充不完整。' }
                $padding -= $count
            }
        }
    } finally {
        if ($outputStream) { $outputStream.Dispose() }
        $gzip.Dispose()
        $inputStream.Dispose()
    }
}

try {
    if (![Environment]::Is64BitOperatingSystem) { throw '本包需要64位Windows。' }
    if (!(Test-Path -LiteralPath (Join-Path $program '短剧投流素材生成平台.exe') -PathType Leaf)) { throw '请先完整解压分享包，再启动。' }
    New-Item -ItemType Directory -Path $models -Force | Out-Null
    foreach ($component in $components) {
        $target = Join-Path $models $component.Name
        if (Test-Path -LiteralPath $target) {
            if (!(Test-Hash $target $component.Hash)) { throw '已有视频组件校验不通过。请保留项目数据，从可信分享包重新解压到新文件夹。' }
            continue
        }
        New-Item -ItemType Directory -Path $work -Force | Out-Null
        Write-Host ('首次启动：正在从组件上游获取 ' + $component.Name + '，请保持网络连接。')
        $archive = Join-Path $work ($component.Name + '.gz')
        $client = New-Object Net.WebClient
        try {
            $client.Headers.Add('User-Agent', 'ShortDramaPeerTrial/0.1.108')
            $client.DownloadFile($component.Url, $archive)
        } finally { $client.Dispose() }
        $staged = Join-Path $work $component.Name
        Expand-Component $archive $staged ($component.Archive -eq 'tar')
        if (!(Test-Hash $staged $component.Hash)) { throw '下载的视频组件校验不通过，已停止启动。请检查网络后重试。' }
        if (Test-Path -LiteralPath $target) {
            if (!(Test-Hash $target $component.Hash)) { throw '另一个启动过程写入了不匹配的视频组件。' }
        } else { [IO.File]::Move($staged, $target) }
    }
    Write-Host '视频组件已就绪。以后启动无需再次下载。'
    if (!$PrepareOnly) { Start-Process -FilePath (Join-Path $program '短剧投流素材生成平台.exe') -WorkingDirectory $program }
} catch {
    Write-Host ('启动未完成：' + $_.Exception.Message) -ForegroundColor Red
    Write-Host '没有修改项目数据。确认网络可用后，可再次双击启动入口重试。'
    exit 1
} finally {
    $resolvedWork = [IO.Path]::GetFullPath($work)
    if ($resolvedWork.StartsWith($temporaryRoot, [StringComparison]::OrdinalIgnoreCase) -and
        [IO.Path]::GetFileName($resolvedWork).StartsWith('shortdrama-first-run-') -and
        (Test-Path -LiteralPath $resolvedWork -PathType Container)) {
        Remove-Item -LiteralPath $resolvedWork -Recurse -Force
    }
}
