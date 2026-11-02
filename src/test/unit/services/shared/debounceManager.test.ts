// A trigger during a running callback is not lost (review A2-4)
import { DebounceManager, SimpleDebounceManager } from '../../../../services/shared/debounceManager';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('debounce managers', () => {
    it('runs once more after the callback when a trigger came in while it ran', async () => {
        let runs = 0;
        const debouncer = new SimpleDebounceManager(async () => { runs++; await sleep(60); }, 10);

        debouncer.trigger();
        await sleep(30); // the callback is running
        debouncer.trigger();
        await sleep(250);

        expect(runs).toBe(2);
        debouncer.dispose();
    });

    it('does not run again when nothing came in', async () => {
        let runs = 0;
        const debouncer = new SimpleDebounceManager(async () => { runs++; await sleep(30); }, 10);
        debouncer.trigger();
        await sleep(200);
        expect(runs).toBe(1);
        debouncer.dispose();
    });

    it('keeps the items that arrive during processing for the next run', async () => {
        const batches: number[][] = [];
        const debouncer = new DebounceManager<number>(async items => { batches.push(items); await sleep(60); }, 10);

        debouncer.trigger(1);
        await sleep(30);
        debouncer.trigger(2);
        await sleep(250);

        expect(batches).toEqual([[1], [2]]);
        debouncer.dispose();
    });

    it('cancel drops a pending rerun', async () => {
        let runs = 0;
        let release: () => void = () => { };
        // The run ends when the test says so, not after a time that a slow machine can overshoot
        const debouncer = new SimpleDebounceManager(async () => { runs++; await new Promise<void>(resolve => { release = resolve; }); }, 10);
        debouncer.trigger();
        for (let waited = 0; runs < 1 && waited < 2000; waited += 5) {
            await sleep(5);
        }
        expect(runs).toBe(1);
        debouncer.trigger();
        await sleep(40); // the timer fires while the run goes on: a rerun is pending
        debouncer.cancel();
        release();
        await sleep(100);
        expect(runs).toBe(1);
    });
});
