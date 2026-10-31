# @pexli/redact

The redaction engine from [Pexli](https://pexli.io). It finds personal data on a live page and blurs it or swaps in sample data, in the browser, before a screenshot is taken.

## What it detects

| Level  | Hides                                  |
| ------ | -------------------------------------- |
| low    | emails, phone numbers                  |
| medium | low, plus social security and card numbers |
| high   | medium, plus IP and MAC addresses      |

Nothing else is detected. Names, street addresses and free text need a manual blur.

## Use

```ts
import { PageRedactor, presetsForLevel } from '@pexli/redact';

const redactor = new PageRedactor();
redactor.start(presetsForLevel('medium'), { mode: 'replace', coverAllFields: false });
// take the screenshot
redactor.stop();
```

`mode: 'replace'` swaps each value for a stable sample (the same original always gets the same stand-in). `mode: 'blur'` blurs it.

For text only, `sensitiveSpans(text, patternsFor(kinds))` returns the matched ranges.

## Tests

```
npm install
npm test
```

The baseline snapshots in `src/__tests__/__snapshots__` pin exactly what is hidden. A change to them is a change in behaviour.

## Reporting missed data

Email security@pexli.io. Please don't open a public issue for a leak.

## License

MIT. Derived from Mimik by Westpoint; see NOTICE.
