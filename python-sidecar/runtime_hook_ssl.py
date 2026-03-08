import os
import sys
import subprocess
import tempfile

if getattr(sys, 'frozen', False):
    import certifi

    cert_path = certifi.where()
    try:
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

    os.environ['SSL_CERT_FILE'] = cert_path
    os.environ['REQUESTS_CA_BUNDLE'] = cert_path