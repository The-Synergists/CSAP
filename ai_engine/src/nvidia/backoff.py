"""NVIDIA's hosted endpoints answer 429 (too many requests) or 503 when busy. Such a request is sent
again after a pause (the server's Retry-After when given, otherwise 2, 4, 8, 16 s with a little jitter)
instead of failing the document."""

import random
import time

import requests

RETRY_STATUS = {429, 503}
ATTEMPTS = 5


def _pause(res: requests.Response, attempt: int) -> float:
    after = res.headers.get("Retry-After")
    try:
        if after is not None:
            return min(30.0, float(after))
    except ValueError:
        pass
    return min(30.0, 2 ** attempt) + random.uniform(0, 1)


def post(url: str, **kwargs) -> requests.Response:
    """requests.post with retries on 429 / 503. The caller handles every other status."""
    res = requests.post(url, **kwargs)
    for attempt in range(1, ATTEMPTS):
        if res.status_code not in RETRY_STATUS:
            return res
        wait = _pause(res, attempt)
        res.close()
        time.sleep(wait)
        res = requests.post(url, **kwargs)
    return res
