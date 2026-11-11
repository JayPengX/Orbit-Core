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
