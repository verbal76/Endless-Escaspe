#!/usr/bin/env python3
"""Cheap workflow / configuration integrity check (no hosted runner needed).

Parses every workflow, and verifies the cross references that, when wrong, only
show up after an expensive run: local reusable workflows exist and are callable,
`needs:` point at real jobs, release.json / build-request.json are well formed.
Run locally with: python3 scripts/ci/check-workflows.py
"""
import glob
import json
import os
import subprocess
import sys

try:
    import yaml
except ImportError:  # hosted runners: install on demand (a few seconds)
    subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', 'pyyaml'], check=True)
    import yaml

errors = []
wfs = {}


class UniqueKeyLoader(yaml.SafeLoader):
    """PyYAML silently keeps the last of two equal keys; a duplicated `jobs:` once hid a whole job."""

    def construct_mapping(self, node, deep=False):
        seen = set()
        for k, _ in node.value:
            key = self.construct_object(k, deep=True)
            if key in seen:
                raise yaml.constructor.ConstructorError(None, None, f'duplicate key {key!r}', k.start_mark)
            seen.add(key)
        return super().construct_mapping(node, deep)


for path in sorted(glob.glob('.github/workflows/*.yml')):
    try:
        wfs[path] = yaml.load(open(path), Loader=UniqueKeyLoader)
    except Exception as e:  # noqa: BLE001
        errors.append(f'{path}: does not parse: {e}')

def triggers(d):
    on = d.get(True, d.get('on'))  # PyYAML reads the key `on` as boolean True
    return on if isinstance(on, dict) else {k: None for k in (on if isinstance(on, list) else [on])}

for path, d in wfs.items():
    if not isinstance(d, dict) or 'jobs' not in d:
        errors.append(f'{path}: no jobs')
        continue
    jobs = d['jobs']
    for name, job in jobs.items():
        for dep in ([job.get('needs')] if isinstance(job.get('needs'), str) else (job.get('needs') or [])):
            if dep not in jobs:
                errors.append(f'{path}: job {name} needs unknown job {dep}')
        uses = job.get('uses')
        if uses and uses.startswith('./'):
            target = uses[2:]
            if target not in [p.replace('\\', '/') for p in wfs] and not os.path.exists(target):
                errors.append(f'{path}: job {name} uses missing workflow {uses}')
            elif target in wfs and 'workflow_call' not in triggers(wfs[target]):
                errors.append(f'{path}: job {name} calls {uses}, which has no workflow_call trigger')

for f in ('release.json', 'app.json', 'scripts/native-fingerprint.json'):
    try:
        json.load(open(f))
    except Exception as e:  # noqa: BLE001
        errors.append(f'{f}: {e}')
rj = json.load(open('release.json'))
if not (isinstance(rj.get('publicVersion'), int) and rj['publicVersion'] > 0):
    errors.append('release.json: publicVersion must be a positive integer')
for f in ('docs/branch-ledger.json',):
    try:
        json.load(open(f))
    except Exception as e:  # noqa: BLE001
        errors.append(f'{f}: {e}')
req = '.github/build-request.json'
if os.path.exists(req):
    r = json.load(open(req))
    import re
    if not re.fullmatch(r'[0-9a-f]{40}', str(r.get('sourceSha', ''))):
        errors.append(f'{req}: sourceSha must be a full 40-char SHA')

if errors:
    print('\n'.join('ERROR ' + e for e in errors))
    sys.exit(1)
print(f'workflow / config check OK ({len(wfs)} workflows)')
