#!/usr/bin/env python3
"""Build the offline demo from pinned, public synthetic fixtures (stdlib only)."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent
ARCHIVE = "agent-file-board-demo.zip"
PREFIX = "agent-file-board-demo"
CLI_BOOTSTRAP = "import runpy,sys;from pathlib import Path;p=Path(sys.argv[1]);sys.path.insert(0,str(p.parent));sys.argv=sys.argv[1:];runpy.run_path(str(p),run_name='__main__')"


def cli(root, *args):
    result = subprocess.run([sys.executable, '-I', '-B', '-c', CLI_BOOTSTRAP,
                             str(root / 'vendor/agent-file-board/boardctl.py'), *map(str, args)],
                            capture_output=True, text=True)
    if result.returncode:
        raise ValueError(f"Demo CLI failed: {result.stderr.strip() or result.stdout.strip()}")
    return result.stdout.strip()


def write_json(path, value):
    path.write_bytes((json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))


def component_types(report):
    found = set()
    def visit(value):
        if isinstance(value, dict):
            if 'type' in value:
                found.add(value['type'])
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)
    visit(report['components'])
    return found


def build_demo(root: Path, destination: Path):
    """Create a new package directory; never modify an existing demo/user board."""
    if destination.exists() or destination.is_symlink():
        raise FileExistsError(destination)
    root, destination = root.resolve(), destination.resolve()
    vendor = root / 'vendor/agent-file-board'
    examples = vendor / 'examples'
    version = json.loads((root / 'package.json').read_text())['version']
    forms_enabled = tuple(map(int, version.split('.'))) >= (2, 3, 0)
    workflows_enabled = tuple(map(int, version.split('.'))) >= (2, 4, 0)
    tools_enabled = tuple(map(int, version.split('.'))) >= (2, 4, 1)
    source_enabled = tuple(map(int, version.split('.'))) >= (2, 8, 0)
    destination.mkdir(parents=True)
    board = destination / 'demo-board'
    base = board / '.agent-board'
    base.mkdir(parents=True)
    # Exact metadata allowlist: no private context, external read state or presence.
    metadata = ['CONVENTION.md', 'GLOSSARY.md', 'components/board-report-v1.schema.json',
                'components/board-report-v2.schema.json', 'components/board-report-v3.schema.json']
    if forms_enabled:
        metadata += ['components/form-question-v2.schema.json', 'components/form-answer-v2.schema.json']
    if workflows_enabled:
        metadata += ['components/form-question-v3.schema.json','components/form-answer-v3.schema.json']
    for rel in metadata:
        target = base / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(vendor / '.agent-board' / rel, target)
    config = json.loads((vendor / '.agent-board/config.json').read_text())
    config['project'] = {'id': 'openui-demo', 'name': 'DEMO — synthetic conversations',
                         'source_of_truth': 'Synthetic examples only; not a real project.'}
    config['time_zone'] = 'UTC'
    config['language'] = json.loads((examples / 'full-conversation/language-config.json').read_text())['language']
    write_json(base / 'config.json', config)
    shutil.copyfile(examples / 'full-conversation/participants.json', base / 'participants.json')
    for directory in ['rooms', 'direct']:
        for source in sorted((examples / 'full-conversation' / directory).glob('*/*.txt')):
            target = base / source.relative_to(examples / 'full-conversation')
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
    (base / 'rooms/general').mkdir(parents=True)
    (base / 'rooms/general/GUIDANCE.md').write_bytes(b'# Demo guidance\n\nAll identities, discussions and results here are fictional. Read the package README for the tour. No agent listener is needed.\n')
    reports = []
    types = set()
    with tempfile.TemporaryDirectory(prefix='afb-demo-inputs-') as inputs:
        inputs = Path(inputs)
        def post(thread, slug, body, *, room='reports', sender='implementation-agent-01', recipient='all', extra=(), minute=30):
            return cli(root, 'post', '--path', board, '--from', sender, '--to', recipient,
                       '--scope', 'room', '--room', room, '--thread', thread, '--slug', slug,
                       '--at', f'2026-10-18T10:{minute:02}:00Z', '--language', 'en', '--body', body, *extra)
        post('T000', 'start-here', '# Welcome to the offline demo\n\nEverything here is **fictional**: participants, conversations, results and embedded images.\n\nStart with the reports room: T004 is a report and historical answer; T007 is the v2 dashboard; T008 has specialty charts; T009 has images, card grids, carousel and modal; T010 is an unanswered choice; T011 is an editable form; T012 has a historical typed form answer; T013 adds conditional fields, dependent choices, cross-field validation and editable rows; T014 has a historical row-operation reply.\n\nArchitecture and product contain sample discussions; Direct contains an agent handoff. Select human-owner-01 to try posting. T015 shows the complete fictional agent/human/agent cycle. Use Structured message for visual form building, local JSON preview and authoring recovery; Saved drafts handles answer backups. WORKFLOW-TRIAL.md has a rehearsal. Recent locations remembers successful opens, last-open wins. The package README has the complete tour.', room='general', extra=('--content-type', 'text/markdown'))
        post('T000', 'how-to-try', 'This is a real file board. Tabs, filters, charts, carousel and modal only change your local view. Send answer or Post creates a file in this demo folder; read-only uploads download a reply instead. Extract another copy of the ZIP to reset.', room='general', sender='research-agent-01', minute=31)
        report_examples = examples / 'openui-report'
        question = report_examples / 'question.json'
        source = json.loads((report_examples / 'static-candidates.json').read_text())
        choices = [
            ('T004', 'release-review', json.loads((report_examples / 'report.json').read_text()), 'Synthetic results: 170 passed; 2 failed. This report already has a historical answer below.', ('--question-file', question, '--status', 'DECISION-NEEDED')),
            ('T007', 'static-dashboard', json.loads((report_examples / 'static-dashboard.json').read_text()), 'Synthetic dashboard: 170 passed, 2 failed. Try tabs, row filtering, sorting, expandable notes and full chart data.', ()),
            ('T008', 'specialty-charts', {**source, 'title': 'Specialty charts', 'components': source['components'][:5]}, 'Synthetic pie/donut, radial, radar, scatter and single stacked bars. Expand Chart data to see exact values.', ()),
            ('T009', 'media-and-local-views', {**source, 'title': 'Offline media and local views', 'components': source['components'][5:]}, 'Synthetic icons, comparison, tags, Markdown, embedded PNG images, card grids, carousel and modal. Scroll to Card layouts and Open supporting details to try the controls.', ()),
        ]
        for thread, slug, report, body, extra in choices:
            path = inputs / (slug + '.json')
            write_json(path, report)
            rel = post(thread, slug, body, extra=('--ui-file', path, *extra))
            types.update(component_types(report))
            reports.append({'thread': thread, 'room': 'reports', 'file': rel, 'title': report['title'], 'version': report['version']})
        original = board / reports[0]['file']
        before = original.read_bytes()
        post('T004', 'historical-answer', 'Synthetic owner decision: fix the two failures and retest before releasing.', sender='human-owner-01', recipient='implementation-agent-01', minute=35,
             extra=('--answer-file', report_examples / 'answer.json', '--reply-to', original.name, '--status', 'REPLY'))
        if original.read_bytes() != before:
            raise ValueError('Demo history changed while adding its answer')
        pending = json.loads(question.read_text())
        pending['id'] = 'demo-next-step'
        pending['prompt'] = 'Try an answer: what should happen next in this fictional release?'
        pending_file = inputs / 'try-question.json'
        write_json(pending_file, pending)
        post('T010', 'try-an-answer', 'Try the choice controls on this fictional report. Select Fix failures or Postpone release, add a note, and press Send answer. The original report stays unchanged.', recipient='human-owner-01',
             extra=('--ui-file', report_examples / 'report.json', '--question-file', pending_file, '--status', 'DECISION-NEEDED'))
        if forms_enabled:
            form_file = report_examples / 'form-question.json'
            form_definition = json.loads(form_file.read_text())
            post('T011', 'offline-form', 'Synthetic release configuration. Try every input, selector and editable cell; Send form answer appends a typed reply. Defaults and reset are local.', recipient='human-owner-01', extra=('--question-file', form_file, '--status', 'DECISION-NEEDED'))
            example = post('T012', 'form-answer-example', 'Synthetic form with a separate historical typed response below. The original table remains unchanged.', recipient='human-owner-01', extra=('--question-file', form_file, '--status', 'DECISION-NEEDED'))
            post('T012', 'historical-form-answer', 'Synthetic typed response: schema estimate changed to1; viewer approval changed totrue. See ANSWER values for every submitted field.', sender='human-owner-01', recipient='implementation-agent-01', minute=40, extra=('--answer-file', report_examples / 'form-answer.json', '--reply-to', Path(example).name, '--status', 'REPLY'))
            actual = {f['type'] for f in form_definition['fields']}
            expected = set(json.loads((vendor / 'openui-upstream.json').read_text())['boardLibrary']['implementedFormFields'])
            if actual != expected:
                raise ValueError(f'Demo form coverage differs: {actual ^ expected}')
        if workflows_enabled:
            workflow = report_examples / 'workflow-question.json'
            post('T013', 'offline-workflow', 'Fictional release workflow. Switch environment to reveal approver and change regions; compare dates and budgets, then add/remove/move task rows. Reload to restore your local draft. No backend is used.', recipient='human-owner-01', extra=('--question-file', workflow, '--status', 'DECISION-NEEDED'))
            source = post('T014', 'workflow-answer-example', 'Fictional v3 workflow with a separate historical answer. All row operations are relative to this immutable original.', recipient='human-owner-01', extra=('--question-file', workflow, '--status', 'DECISION-NEEDED'))
            post('T014', 'historical-workflow-answer', 'Fictional production plan: added release-notes, removed viewer, moved release-notes first and changed schema hours to3. Original rows/messages remain intact.', sender='human-owner-01', recipient='implementation-agent-01', minute=40, extra=('--answer-file', report_examples / 'workflow-answer.json', '--reply-to', Path(source).name, '--status', 'REPLY'))
        if tools_enabled:
            cycle = post('T015', 'agent-owner-cycle', 'Fictional agent asks for a release plan. The human response and explicit agent read follow below; no deployment is executed.', recipient='human-owner-01', extra=('--question-file', report_examples / 'workflow-question.json', '--status', 'DECISION-NEEDED'))
            response = post('T015', 'owner-cycle-answer', 'Fictional human chooses production/eu with budget150, adds release-notes, removes viewer and moves release-notes first. Review the read-only comparison.', sender='human-owner-01', recipient='implementation-agent-01', minute=40, extra=('--answer-file', report_examples / 'workflow-answer.json', '--reply-to', Path(cycle).name, '--status', 'REPLY'))
            post('T015', 'agent-read-answer', 'I read the fictional typed answer: production/eu, requested150 within approved200, schema hours3 and the submitted row operations. No deployment was performed; the response remains a separate immutable file.', recipient='human-owner-01', minute=45, extra=('--reply-to', Path(response).name, '--status', 'REPLY'))
        if source_enabled:
            post('T016', 'source-review', (examples / 'source-code/review.md').read_text(), extra=('--content-type', 'text/markdown'))
    cli(root, 'validate', '--path', board)
    implemented = set(json.loads((vendor / 'openui-upstream.json').read_text())['boardLibrary']['implementedTypes'])
    if types != implemented:
        raise ValueError(f'Demo component coverage differs: {types ^ implemented}')
    manifest = {'viewerVersion': version, 'synthetic': True, 'boardFolder': 'demo-board',
                'componentTypes': sorted(types), 'reports': reports,
                'tryAnswer': {'room': 'reports', 'thread': 'T010', 'question': 'demo-next-step'}}
    if forms_enabled:
        manifest['formFieldTypes'] = sorted(actual)
        manifest['formTopics'] = ['T011', 'T012']
    if workflows_enabled:
        manifest['workflowTopics']=['T013','T014']
        manifest['formVersions']=[2,3]
        manifest['offlineWorkflows']=['persistent-drafts','conditional-fields','dependent-options','cross-field-validation','row-add-remove-reorder']
    if tools_enabled:
        manifest['offlineTools']=['answer-review','authoring-preview','draft-manager','authoring-drafts','visual-form-builder']
        manifest['agentRoundtripTopic']='T015'
        manifest['draftExample']='example-draft.json'
        manifest['authoringExample']='authoring-example.json'
        manifest['workflowTrial']='WORKFLOW-TRIAL.md'
        manifest['colorThemes']=['system','light','dark','dracula']
        manifest['locationHistory']={'limit':20,'order':'last-open-wins','native':'handle-identity','uploads':'reselect'}
        shutil.copyfile(root / 'docs/examples/drafts/authoring-workflow.json', destination / 'authoring-example.json')
        shutil.copyfile(root / 'docs/guides/LOCAL-WORKFLOW.md', destination / 'WORKFLOW-TRIAL.md')
        shutil.copyfile(root / 'docs/examples/drafts/demo-workflow-draft.json', destination / 'example-draft.json')
    if tuple(map(int, version.split('.'))) >= (2, 6, 1):
        skill = destination / 'skills/board-feedback'
        skill.mkdir(parents=True)
        shutil.copyfile(vendor / 'skills/board-feedback/SKILL.md', skill / 'SKILL.md')
        (destination / 'docs').mkdir()
        shutil.copyfile(vendor / 'docs/FEEDBACK.md', destination / 'docs/FEEDBACK.md')
        manifest['feedback'] = {'guide': 'docs/FEEDBACK.md', 'skill': 'skills/board-feedback/SKILL.md'}
    if tuple(map(int, version.split('.'))) >= (2, 7, 0):
        for name in ['EXTENSIONS.md', 'EXTENSION-LIFECYCLE.md']:
            shutil.copyfile(vendor / 'docs' / name, destination / 'docs' / name)
        samples = destination / 'examples/extensions'
        samples.mkdir(parents=True)
        for name in ['example-approvals', 'lifecycle-worker', 'lifecycle-declarative']:
            shutil.copyfile(vendor / 'examples/extensions' / (name + '.afb-plugin.json'), samples / (name + '.afb-plugin.json'))
        manifest['extensions'] = {'api': '1.2.0', 'guide': 'docs/EXTENSION-LIFECYCLE.md', 'examples': 'examples/extensions'}
    if source_enabled:
        shutil.copyfile(vendor / 'docs/SOURCE-CODE.md', destination / 'docs/SOURCE-CODE.md')
        shutil.copytree(examples / 'source-code', destination / 'examples/source-code')
        shutil.copyfile(examples / 'extensions/source-review.afb-plugin.json', destination / 'examples/extensions/source-review.afb-plugin.json')
        manifest['extensions']['api'] = '1.3.0'
        manifest['sourcePresentation'] = {'guide': 'docs/SOURCE-CODE.md', 'room': 'reports', 'thread': 'T016', 'views': ['unified', 'split', 'source']}
    if tuple(map(int, version.split('.'))) >= (2, 9, 0):
        for rel in ['SKILL.md','agents/openai.yaml','scripts/board_loop.py','references/harnesses.md','references/opportunistic.md']:
            target = destination / 'skills/board-loop' / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(vendor / 'skills/board-loop' / rel, target)
        shutil.copyfile(root / 'docs/guides/BOARD-LOOP.md', destination / 'docs/BOARD-LOOP.md')
        shutil.copyfile(root / 'docs/guides/COMPOSER.md', destination / 'docs/COMPOSER.md')
        manifest['opportunisticObservation'] = {'skill':'skills/board-loop/SKILL.md','guide':'docs/BOARD-LOOP.md','defaultDurationSeconds':28800,'idleSeconds':900,'activeSeconds':15}
    write_json(destination / 'demo-manifest.json', manifest)
    shutil.copyfile(root / 'board.html', destination / 'board.html')
    shutil.copyfile(root / 'docs/guides/DEMO.md', destination / 'README.md')
    for name in ['LICENSE', 'THIRD_PARTY_NOTICES.md']:
        shutil.copyfile(root / name, destination / name)
    shutil.copytree(root / 'licenses', destination / 'licenses')
    return manifest


def archive_demo(root: Path, output: Path):
    if output.exists() or output.is_symlink():
        raise FileExistsError(output)
    output = output.resolve()
    with tempfile.TemporaryDirectory(prefix='afb-demo-build-') as directory:
        package = Path(directory) / PREFIX
        build_demo(root, package)
        # Stored ZIP entries avoid platform/zlib-dependent compressed bytes.
        with zipfile.ZipFile(output, 'x', compression=zipfile.ZIP_STORED) as archive:
            for path in sorted(p for p in package.rglob('*') if p.is_file()):
                info = zipfile.ZipInfo(PREFIX + '/' + path.relative_to(package).as_posix(), date_time=(2026, 10, 18, 0, 0, 0))
                info.create_system = 3
                info.external_attr = 0o100644 << 16
                archive.writestr(info, path.read_bytes())
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=ROOT)
    parser.add_argument('--output', type=Path, required=True, help='New .zip path (or directory with --directory)')
    parser.add_argument('--directory', action='store_true', help='Create an unpacked demo instead of a ZIP')
    args = parser.parse_args()
    if args.directory:
        build_demo(args.root, args.output)
    else:
        archive_demo(args.root, args.output)
    print(args.output)


if __name__ == '__main__':
    main()
