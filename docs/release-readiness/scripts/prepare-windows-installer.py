"""Create an NSIS installer around the unchanged, verified 1.0.0 application."""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path


def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--archive', type=Path)
    parser.add_argument('--archive-sha256', default='4d43ca54168d32e6769ff58e580087ba11638658a3d223db8f1080905f0467d6')
    args = parser.parse_args()
    root = args.root.resolve()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    archive = args.archive.resolve() if args.archive else root.parents[1] / '03_发布包/素材平台-1.0.0-正式初版/素材平台-1.0.0-Windows-x64-正式初版.zip'
    if sha(archive) != args.archive_sha256:
        raise RuntimeError('Verified input ZIP identity mismatch')
    staging = root / ('.tmp/windows-installer-' + uuid.uuid4().hex)
    staging.mkdir(parents=True, exist_ok=False)
    with zipfile.ZipFile(archive) as zipped:
        if zipped.testzip() is not None:
            raise RuntimeError('Input ZIP CRC failure')
        for entry in zipped.infolist():
            if not (staging / entry.filename).resolve().is_relative_to(staging):
                raise RuntimeError('Unsafe input archive path')
        zipped.extractall(staging)
    bundle = next(p for p in staging.iterdir() if p.is_dir())
    inventory = json.loads((bundle / '分发校验清单.json').read_text(encoding='utf-8-sig'))
    version = inventory['appVersion']
    name = f'ShortDramaMaterialStudio-{version}-Setup-x64.exe'
    if (output / name).exists():
        raise RuntimeError('Completed installer is immutable; use a new revision directory')
    for item in inventory['files']:
        if sha(bundle / item['path']) != item['sha256']:
            raise RuntimeError('Input ZIP file identity mismatch: ' + item['path'])
    payload = staging / 'payload'
    shutil.copytree(bundle / '程序', payload)
    shutil.copytree(bundle / '第三方许可', payload / '第三方许可')
    origins = (bundle / '第三方组件与源码来源.txt').read_text(encoding='utf-8-sig')
    origins = origins.replace('1.0.0正式初版发布包', '1.0.0 Windows安装包').replace('0.1.108亲友试用包', f'{version} Windows安装包')
    origins = origins.replace('程序/LICENSE.electron.txt', 'LICENSE.electron.txt').replace('程序/LICENSES.chromium.html', 'LICENSES.chromium.html')
    origins = origins.replace('本ZIP', '本安装包').replace('首次启动入口由接收者', '安装阶段由接收者')
    origins = origins.replace('首次下载补全后的程序目录', '安装后补全的程序目录').replace('分享时使用原始ZIP', '分发时使用原始Setup安装文件')
    (payload / '第三方组件与源码来源.txt').write_text(origins, encoding='utf-8-sig')
    helper = payload / 'resources/install'
    helper.mkdir(parents=True, exist_ok=False)
    script = (bundle / '首次启动.ps1').read_text(encoding='utf-8-sig')
    script = script.replace("$program = Join-Path $PSScriptRoot '程序'", "$program = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\\..'))")
    script = script.replace("$ErrorActionPreference = 'Stop'", "$ErrorActionPreference = 'Stop'\n[Console]::OutputEncoding = New-Object Text.UTF8Encoding")
    script = script.replace('首次启动：', '安装准备：').replace('发布包', '安装包')
    script = script.replace('请先完整解压安装包，再启动。', '安装文件不完整，请重新运行安装程序。')
    script = script.replace('从可信安装包重新解压到新文件夹。', '使用可信Setup安装文件重新安装。')
    script = script.replace('启动未完成：', '安装准备未完成：').replace('可再次双击启动入口重试。', '可重新运行安装程序重试。')
    (helper / 'InitializeComponents.ps1').write_text(script, encoding='utf-8-sig')
    readme = f'''短剧投流素材生成平台 {version} 安装版

安装期间会联网下载并校验两个视频组件。安装成功后，双击桌面或开始菜单的“短剧投流素材生成平台”，直接打开软件EXE，不需要BAT或手动解压。
首次使用配置自己的文本分析/ASR服务；本地OCR及模型随安装包提供。调用云端服务需自有账号、网络和相应费用。
数据位于 %APPDATA%\\ShortDramaMaterialStudio，原片按原路径引用。卸载软件不会删除项目数据、原片或导出成果。升级前退出软件并备份数据与原片，保留旧程序；不要同时运行多个版本。
本包未签名；跨电脑兼容性尚未验收。本机安装及业务验证范围见发布说明。云OCR/P2未开放，二创保持受控本地模式。
安装联网失败时安装器会明确报错，不显示完成；联网后可重新运行安装器，或在Windows应用列表卸载未完成安装。
请只分发原始Setup安装文件，保留第三方许可，不要将安装后补全的视频工具重新打包分发。
'''
    (payload / '先读我.txt').write_text(readme, encoding='utf-8-sig')
    for tool, expected in {
        'ffmpeg.exe': '04e1307997530f9cf2fe35cba2ca7e8875ca91da02f89d6c7243df819c94ad00',
        'ffprobe.exe': '4303ec85855340689b1f8aa5d9c1dc06ef3e3090682de3034edc3fca2b0798d5',
    }.items():
        actual = sha(payload / 'resources/models' / tool)
        if actual != expected:
            raise RuntimeError(f'Bundled video component mismatch: {tool}')
    for item in inventory['files']:
        if item['path'].startswith('程序/') and sha(payload / item['path'][3:]) != item['sha256']:
            raise RuntimeError('Application bytes changed')
    audit = '''import {readdirSync} from 'node:fs'; import {join} from 'node:path';
import {auditPackagePrivacy,developmentPathStrings} from './tools/package-privacy-audit.mjs';
const walk=p=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(p,e.name)):[join(p,e.name)]);
auditPackagePrivacy(walk(process.argv[1]),developmentPathStrings(process.cwd())); console.log('INSTALLER_PAYLOAD_PRIVACY_PASS');'''
    subprocess.run(['node', '--input-type=module', '-e', audit, str(payload)], cwd=root, check=True)
    config = {
        'extends': None,
        'appId': 'local.shortdrama.materialstudio',
        'productName': '短剧投流素材生成平台',
        'artifactName': name,
        'directories': {'output': str(output)},
        'publish': None,
        'win': {'target': ['nsis'], 'signAndEditExecutable': False},
        'nsis': {'oneClick': False, 'perMachine': False, 'allowElevation': False,
                 'allowToChangeInstallationDirectory': True,
                 'useZip': True,
                 'createDesktopShortcut': 'always', 'createStartMenuShortcut': True,
                 'shortcutName': '短剧投流素材生成平台', 'runAfterFinish': False,
                 'deleteAppDataOnUninstall': False, 'differentialPackage': False,
                 'installerLanguages': ['zh_CN'], 'language': '2052',
                 'include': str(root / 'docs/release-readiness/windows-installer/components.nsh')},
    }
    config_path = staging / 'installer-config.json'
    config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding='utf-8')
    subprocess.run(['node', str(root / 'node_modules/electron-builder/cli.js'),
                    '--win', 'nsis', '--x64', '--publish', 'never',
                    '--prepackaged', str(payload), '--config', str(config_path)],
                   cwd=root, check=True, env={**os.environ, 'CSC_IDENTITY_AUTO_DISCOVERY': 'false'})
    installer = output / name
    if not installer.is_file():
        raise RuntimeError('Expected installer missing')
    for item in inventory['files']:
        if item['path'].startswith('程序/') and sha(payload / item['path'][3:]) != item['sha256']:
            raise RuntimeError('Builder changed verified application bytes')
    record = {'artifact': f'{version}-setup-r1', 'appVersion': version,
              'createdAt': datetime.now(timezone.utc).isoformat(),
              'inputZipSha256': sha(archive), 'installerSha256': sha(installer),
              'installerBytes': installer.stat().st_size,
              'applicationHashes': inventory['applicationHashes'],
              'sourceAppUnchanged': True, 'videoBinariesIncluded': True,
              'payload': str(payload), 'config': config,
              'payloadFiles': [{'path': p.relative_to(payload).as_posix(), 'sha256': sha(p), 'bytes': p.stat().st_size} for p in sorted(payload.rglob('*')) if p.is_file()]}
    (output / 'installer-manifest.json').write_text(json.dumps(record, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    (output / 'SHA256-Setup.txt').write_text(record['installerSha256']+'  '+name+'\n', encoding='utf-8')
    print(json.dumps({key:record[key] for key in ['artifact','installerSha256','installerBytes','sourceAppUnchanged']},ensure_ascii=False))


if __name__ == '__main__':
    main()
