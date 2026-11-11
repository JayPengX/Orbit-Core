# The API credit's jobs

The Max plan's US$100 of Claude API credit (expires with the plan), spent on
work whose results are kept as data, tests or rules, so nothing live depends
on it. Run by `.github/workflows/credit.yml` (job, cmd), key in the repo
secret `ANTHROPIC_CREDIT_KEY`. `lib.mjs`: build → guess → budget check
(US$100 in all, `ledger.json`) → one Message Batch (half price) → collect
into `out/<job>.jsonl`. Locally: `node jobs/<job>.mjs size` guesses the cost with no key.

| Job | Model | What |
| --- | --- | --- |
| 3-rulings | Sonnet 5.5 | Every 釋字 and 憲判字 explained ahead of time (zh, en), with /law-ask's own prompt |
| 4-agency | Haiku 5.5 | Every agency rule: one plain line and the words people search it by |
| 5-phrases | Opus 5.5 | 116 everyday laws: what people type → the law's own words and articles (checked in the text) |
| 8-articles | Sonnet 5.5 | Those laws' first 3,500 articles explained ahead of time with /law-ask's explainer |
| 2a-run | each feature's own Claude model | Every AI feature's examples answered as live |
| 2b-review | Opus 5.5 | Each feature reviewed on those answers: findings, exact prompt edits, new examples |
