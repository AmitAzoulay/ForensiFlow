import importlib
import pathlib

_dir = pathlib.Path(__file__).parent
for _f in sorted(_dir.glob("event_*.py")):
    importlib.import_module(f"services.handlers.ai_generated.{_f.stem}")
