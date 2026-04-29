# Keep the legacy CLI runner out of pytest collection — it's a script, not a pytest suite.
collect_ignore = ["backend_test.py"]
