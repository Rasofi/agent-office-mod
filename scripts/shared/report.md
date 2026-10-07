## Report format

End every run with this block, after any role-specific lines:

```
STATUS: pass | warn | block
FINDINGS:
- [BLOCKER|WARN|NOTE] file:line — what — why — suggested fix
OUT_OF_SCOPE: <anything you noticed outside your brief, for agent-pack:scout>, or "none"
```

- `pass`: done, nothing open. `warn`: done, with issues to look at. `block`: you could not do the job, or something is broken or unsafe.
- BLOCKER only for broken behaviour, data loss, a security hole or a broken promise of the contract. Everything else is WARN or NOTE, however many there are.
- No findings is a valid result: write `FINDINGS: none`.
