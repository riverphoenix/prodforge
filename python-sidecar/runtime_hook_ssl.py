import os
import sys
import ssl

if getattr(sys, 'frozen', False):
    import certifi

    cert_path = certifi.where()

    # Try to combine certifi certs with macOS system certs
    try:
        import subprocess
        import tempfile

        certifi_certs = open(cert_path, 'r').read()
        result = subprocess.run(
            ['security', 'find-certificate', '-a', '-p',
             '/Library/Keychains/System.keychain'],
            capture_output=True, text=True, timeout=5
        )
        system_certs = result.stdout if result.returncode == 0 else ''
        if system_certs:
            combined = os.path.join(tempfile.gettempdir(), 'prodforge-ca-bundle.pem')
            with open(combined, 'w') as f:
                f.write(certifi_certs)
                f.write('\n')
                f.write(system_certs)
            cert_path = combined
    except Exception:
        pass

    # Set env vars for libraries that check them
    os.environ['SSL_CERT_FILE'] = cert_path
    os.environ['REQUESTS_CA_BUNDLE'] = cert_path
    os.environ['CURL_CA_BUNDLE'] = cert_path

    # Monkey-patch ssl.create_default_context to always use our cert bundle
    # This is needed because httpx/httpcore use ssl.create_default_context()
    # which in a PyInstaller bundle on macOS can't find system certs
    _original_create_default_context = ssl.create_default_context

    def _patched_create_default_context(purpose=ssl.Purpose.SERVER_AUTH, *, cafile=None, capath=None, cadata=None):
        ctx = _original_create_default_context(purpose, cafile=cafile, capath=capath, cadata=cadata)
        if cafile is None and capath is None and cadata is None:
            ctx.load_verify_locations(cafile=cert_path)
        return ctx

    ssl.create_default_context = _patched_create_default_context
