"""Assemble a separate peer ZIP from an immutable verified candidate; never rebuild it."""
import argparse
import email
import hashlib
import json
import shutil
import subprocess
import zipfile
import uuid
from datetime import datetime, timezone
from pathlib import Path


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding='utf-8-sig')


def collect_licenses(root, extracted, target):
    rows = []
    for package in sorted(extracted.rglob('package.json')):
        data = json.loads(package.read_text(encoding='utf-8'))
        name, version = data.get('name'), data.get('version')
        if not name or not version:
            continue
        label = (name + '-' + version).replace('/', '__').replace('@', '')
        files = []
        for item in package.parent.iterdir():
            if item.is_file() and item.name.lower().startswith(('license', 'copying', 'notice')):
                destination = target / 'JavaScript' / label / item.name
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(item, destination)
                files.append(destination.relative_to(target).as_posix())
        rows.append({'ecosystem': 'npm', 'name': name, 'version': version,
                     'license': data.get('license', 'see upstream'), 'files': files})
    site = root / 'tools/local-ocr/.venv/Lib/site-packages'
    for metadata in sorted(site.glob('*.dist-info/METADATA')):
        data = email.message_from_string(metadata.read_text(encoding='utf-8'))
        label = metadata.parent.name
        files = []
        for item in metadata.parent.rglob('*'):
            if item.is_file() and (item.name.lower().startswith(('license', 'copying', 'notice'))
                                   or 'licenses' in item.parts):
                destination = target / 'Python' / label / item.relative_to(metadata.parent)
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(item, destination)
                files.append(destination.relative_to(target).as_posix())
        rows.append({'ecosystem': 'python-build-environment', 'name': data.get('Name'),
                     'version': data.get('Version'), 'license': data.get('License-Expression') or data.get('License'),
                     'files': files})
    for name in ['ffmpeg-static', 'ffprobe-static']:
        for item in (root / 'node_modules' / name).iterdir():
            if item.is_file() and (item.name.lower().startswith(('license', 'readme'))
                                   or item.name.endswith(('.LICENSE', '.README'))):
                destination = target / name / item.name
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(item, destination)
    for item in site.rglob('*'):
        if (item.is_file() and item.name.lower().startswith(('license', 'copying', 'notice'))
                and item.suffix.lower() in ('', '.txt', '.md', '.rst', '.html')):
            destination = target / 'Python-all-notices' / item.relative_to(site)
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(item, destination)
    configuration = (root / 'tools/local-ocr/.venv/pyvenv.cfg').read_text(encoding='utf-8')
    python_home = next(line.split(' = ', 1)[1] for line in configuration.splitlines() if line.startswith('home = '))
    shutil.copy2(Path(python_home) / 'LICENSE.txt', target / 'Python-LICENSE.txt')
    write(target / '依赖许可索引.json', json.dumps(rows, ensure_ascii=False, indent=2))
    return len(rows)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    root = args.root.resolve()
    candidate = root / 'release/candidates/v0.1.108-p1-internal-trial'
    manifest = json.loads((candidate / 'candidate-manifest.json').read_text(encoding='utf-8-sig'))
    binary = candidate / 'win-unpacked'
    expected = {'短剧投流素材生成平台.exe': 'ea9fd8ba87e57cfe93126d42e9b268466a5575682b69d4de287cda0aef6a198b',
                'resources/app.asar': 'bca1984d779e6b0339211f1a19a66858f88320200f9786220ffbaa5733918d5a'}
    for relative, sha in expected.items():
        if digest(binary / relative) != sha:
            raise RuntimeError('Verified candidate identity mismatch: ' + relative)
    if not (candidate / 'verification-evidence.json').is_file():
        raise RuntimeError('Candidate verification evidence required')
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    archive = output / '素材平台-0.1.108-Windows-x64-亲友试用.zip'
    if archive.exists():
        raise RuntimeError('Completed archive is immutable; select a new output directory')
    staging = root / ('.tmp/peer-distribution-0.1.108-' + uuid.uuid4().hex)
    staging.mkdir(parents=True, exist_ok=False)
    bundle = staging / '素材平台-0.1.108-亲友试用'
    excluded = {'resources/models/ffmpeg.exe', 'resources/models/ffprobe.exe'}
    def ignore(directory, names):
        return [name for name in names if (Path(directory) / name).relative_to(binary).as_posix() in excluded]
    shutil.copytree(binary, bundle / '程序', ignore=ignore)
    for item in binary.rglob('*'):
        if item.is_file() and item.relative_to(binary).as_posix() not in excluded and digest(item) != digest(bundle / '程序' / item.relative_to(binary)):
            raise RuntimeError('Copied application mismatch')
    extracted = staging / 'asar-license-input'
    asar = next((root / 'node_modules/.pnpm').glob('@electron+asar@*/node_modules/@electron/asar'))
    subprocess.run(['node', '-e', 'require(process.argv[1]).extractAll(process.argv[2],process.argv[3])',
                    str(asar), str(binary / 'resources/app.asar'), str(extracted)], check=True)
    count = collect_licenses(root, extracted, bundle / '第三方许可')
    template = root / 'docs/release-readiness/peer-distribution'
    for name in ['先读我.txt', '第三方组件与源码来源.txt', '首次启动.ps1']:
        shutil.copy2(template / name, bundle / name)
    script = bundle / '首次启动.ps1'
    script.write_text(script.read_text(encoding='utf-8-sig'), encoding='utf-8-sig')
    (bundle / '01_启动素材平台.bat').write_bytes(('@echo off\r\nchcp 65001 >nul\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0首次启动.ps1"\r\nif errorlevel 1 pause\r\n').encode('utf-8'))
    # Do not ship build manifest absolute paths, local test logs, data or credentials.
    inventory = [{'path': p.relative_to(bundle).as_posix(), 'size': p.stat().st_size, 'sha256': digest(p)}
                 for p in sorted(bundle.rglob('*')) if p.is_file()]
    record = {'distributionId': '0.1.108-peer-r1', 'appVersion': '0.1.108',
              'platform': 'win32-x64', 'channel': 'peer-trial', 'signed': False,
              'createdAt': datetime.now(timezone.utc).isoformat(),
              'candidateManifestSha256': digest(candidate / 'candidate-manifest.json'),
              'candidateVerificationSha256': digest(candidate / 'verification-evidence.json'),
              'applicationHashes': expected, 'licenseIndexEntries': count, 'files': inventory}
    record['firstRunDownloads'] = [{'path': relative, 'sha256': digest(binary / relative)} for relative in sorted(excluded)]
    write(bundle / '分发校验清单.json', json.dumps(record, ensure_ascii=False, indent=2))
    audit = '''import {readdirSync} from 'node:fs'; import {join} from 'node:path';
import {auditPackagePrivacy,developmentPathStrings} from './tools/package-privacy-audit.mjs';
const walk=p=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(p,e.name)):[join(p,e.name)]);
auditPackagePrivacy(walk(process.argv[1]),developmentPathStrings(process.cwd()));'''
    subprocess.run(['node', '--input-type=module', '-e', audit, str(bundle)], cwd=root, check=True)
    partial = output / ('peer-' + uuid.uuid4().hex + '.partial')
    with zipfile.ZipFile(partial, 'x', zipfile.ZIP_DEFLATED, compresslevel=6) as zipped:
        for item in sorted(bundle.rglob('*')):
            if item.is_file():
                zipped.write(item, item.relative_to(staging).as_posix())
    with zipfile.ZipFile(partial) as zipped:
        if zipped.testzip() is not None:
            raise RuntimeError('ZIP integrity failure')
    partial.rename(archive)
    sha = digest(archive)
    write(output / 'SHA256.txt', sha + '  ' + archive.name + '\n')
    print(json.dumps({'archive': str(archive), 'sha256': sha, 'bytes': archive.stat().st_size,
                      'applicationFileCount': sum(p.is_file() for p in binary.rglob('*')),
                      'licenseIndexEntries': count}, ensure_ascii=False))


if __name__ == '__main__':
    main()
