"""Prompt template reserved for LLM-drafted narratives (not used yet).

The deterministic rules in src/discrepancy_detector decide every pass / fail. A language
model, if added, may only rephrase those results for the officer; it must not change them.
"""

RECOMMENDATION_NARRATIVE_PROMPT = """
You are assisting a CPCL procurement officer reviewing a bid. Your output is ADVISORY.
The final decision is made by the designated procurement officer.

You are given the tender requirements and the rule-engine results for one bid, including each
finding's expected value, submitted value, comparison and evidence reference.

Write a short plain-language summary that:
1. States which requirements are not met or need review, citing the finding IDs.
2. Uses only the facts provided. Do not invent figures, documents or registry results.
3. Does not claim that any government registry was checked unless the input says so.
4. Ends with the rule engine's suggested action, described as a suggestion.
"""
