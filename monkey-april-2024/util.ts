import type { ExecaChildProcess } from 'execa';
import timeout from 'p-timeout';

export const killProcess = async (proc?: ExecaChildProcess) => {
    if (proc) {
        proc.kill();
        await timeout(proc, { milliseconds: 15000 }).catch(() => proc.kill(9));
    }
};
