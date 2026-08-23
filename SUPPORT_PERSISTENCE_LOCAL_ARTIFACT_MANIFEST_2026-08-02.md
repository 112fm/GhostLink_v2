# Local Support Persistence Artifact

This manifest is intentionally kept outside the ignored server-runtime tree.
It is a reproducibility index only; it does not contain production data,
Telegram credentials, initData, VLESS keys, or payment data.

## Local source files

The visible, Git-safe laboratory files are:

- `support_lab/mock_api.py`
- `support_lab/storage.py`
- `support_lab/redaction.py`
- `support_lab/serialization.py`
- `support_lab/runtime.py`
- `support_lab/test_real_runtime.py`
- `support_lab/requirements.runtime.lock`
- `support_lab/test_mock_api.py`
- `support_lab/test_runtime.py`
- `support_lab/__init__.py`

They exercise the ignored local backend store without making the backend runtime
itself publishable.

- `backend/security/support_redaction.py`
- `backend/services/support_serialization.py`
- `backend/services/support_retention.py`
- `backend/storage/support.py`
- `backend/routes/support.py`
- `backend/routes/admin.py`
- `backend/app_factory.py`
- `bot/modules/handlers.py`
- `tests/test_support_storage.py`

## Required local checks

```text
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest -v tests/test_support_storage.py
PYTHONDONTWRITEBYTECODE=1 python3 -c "import ast; from pathlib import Path; [ast.parse(Path(p).read_text(), filename=p) for p in [...]]"
```

Expected focused result: `7 tests`, all passing.

Dependency-free laboratory check:

```text
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest -v support_lab.test_mock_api
```

Expected laboratory result: `14 tests`, all passing. These are the route/storage
tests that do not require the ignored backend or bot runtime.

The clean-checkout check uses only `HEAD` plus the staged safe lab files:

```text
git archive HEAD | tar -x -C <temp-dir>
git diff --cached --binary | git -C <temp-dir> apply -
(cd <temp-dir> && PYTHONDONTWRITEBYTECODE=1 python3 -m unittest -v support_lab.test_mock_api)
```

Expected clean-checkout result: `14 tests`, all passing; the real-runtime test
module is present but skips its four tests when ignored backend/bot sources are
not available in the clean checkout.

Dependency-complete local runtime check:

```text
.venv-support-runtime311/bin/python -m unittest -v support_lab.test_real_runtime
```

Expected runtime result: `4 tests`, all passing. This test requires the ignored
local `backend/` and `bot/` source tree; it is not a production deployment and
is intentionally separate from the clean Git checkout.

Combined local verification is therefore `25 tests`: 14 lab tests, 4 real
FastAPI/aiogram runtime tests, and 7 existing support-store tests.

## Git policy

The repository intentionally ignores `/backend/`, `/bot/`, and `tests/` because
server runtime files must not be pushed to GitHub. This manifest preserves the
file list and verification contract without weakening that safety boundary.

Before any future production rollout, create a reviewed patch/archive from the
exact production revision and keep it outside the public repository.
