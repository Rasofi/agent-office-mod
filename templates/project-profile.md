production: true          # live users → stricter review
personal_data: true       # forms, accounts, analytics → compliance-reviewer
ai_features: false        # chatbot, AI content → compliance-reviewer (AI part)
jurisdiction: eu          # eu | us | uk | other
languages: [en]           # docs language; the first is used for release notes
release_notes: none       # none | client: a plain-language note for non-developers
protected_branches: [main, master]
checks: npm test          # commands the verifier must run
followups: ask            # ask | file | off
