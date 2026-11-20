import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SKRIPT = resolve(__dirname, '../../../scripts/sicherung-probe.sh');

describe('sicherung-probe.sh', () => {
  let ordner: string;

  beforeEach(() => {
    ordner = mkdtempSync(join(tmpdir(), 'sicherung-probe-'));
    for (const name of ['bin', 'ablage', 'stand', 'docker']) {
      mkdirSync(join(ordner, name));
    }

    writeFileSync(
      join(ordner, 'ablage', 'stegwerk-20261020-032000.dump'),
      Buffer.alloc(1024 * 1024),
    );

    const docker = `#!/usr/bin/env bash
echo "$*" >> "${join(ordner, 'docker.log')}"
case "$1" in
  compose) echo abc123 ;;
  inspect) echo postgres:16-alpine ;;
  info) echo "${join(ordner, 'docker')}" ;;
  run) exit 1 ;;
esac
`;
    const df = `#!/usr/bin/env bash
echo "Filesystem 1024-blocks Used Available Capacity Mounted on"
echo "/dev/x 100000000 1 $FREI_KB 1% /"
`;
    writeFileSync(join(ordner, 'bin', 'docker'), docker);
    writeFileSync(join(ordner, 'bin', 'df'), df);
    chmodSync(join(ordner, 'bin', 'docker'), 0o755);
    chmodSync(join(ordner, 'bin', 'df'), 0o755);
  });

  afterEach(() => rmSync(ordner, { recursive: true, force: true }));

  const probe = (freiKb: number) => {
    const lauf = spawnSync('bash', [SKRIPT], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${join(ordner, 'bin')}:${process.env.PATH ?? ''}`,
        FREI_KB: String(freiKb),
        ZIEL: ordner,
        ABLAGE: join(ordner, 'ablage'),
        STAND: join(ordner, 'stand'),
        PLATZ_RESERVE_MB: '100',
      },
    });
    let aufrufe = '';
    try {
      aufrufe = readFileSync(join(ordner, 'docker.log'), 'utf8');
    } catch {}
    const ergebnis = JSON.parse(
      readFileSync(join(ordner, 'stand', 'sicherung-probe.json'), 'utf8'),
    ) as { ok: boolean; meldung: string };

    return { lauf, aufrufe, ergebnis };
  };

  it('bricht bei zu wenig Platz vor docker run ab', () => {
    const { lauf, aufrufe, ergebnis } = probe(50 * 1024);

    expect(lauf.status).not.toBe(0);
    expect(aufrufe).not.toMatch(/^run /mu);
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.meldung).toMatch(
      /Zu wenig Platz .* frei 50 MB, nötig 103 MB/u,
    );
  });

  it('startet die Probe, wenn genug Platz ist', () => {
    const { aufrufe, ergebnis } = probe(200 * 1024);

    expect(aufrufe).toMatch(/^run /mu);
    expect(ergebnis.meldung).toBe(
      'Der Probe-Container ließ sich nicht starten.',
    );
  });
});
