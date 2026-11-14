# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.4.x   | :white_check_mark: |
| < 1.4   | :x:                |

## Reporting a Vulnerability

We take the security of SoundControl seriously. If you believe you have found
a security vulnerability, please report it to us as described below.

**Please do not report security vulnerabilities through public GitHub issues.**

### How to Report

Please send an email to security@soundcontrol.app with the following information:

- A description of the vulnerability
- Steps to reproduce the issue
- Affected versions
- Potential impact
- Any proof-of-concept code (optional but helpful)

### What to Expect

- You will receive an acknowledgment within 48 hours
- We will investigate the issue and keep you updated on progress
- We will work with you to understand and resolve the issue
- We will credit you for the discovery (if you wish)

## Security Best Practices

SoundControl follows these security practices:

- All Bluetooth communication uses the official Soundcore CMF protocol
- No user data is sent to external servers (local-only)
- SQLite database stores data locally on your device
- No account creation or cloud sync
- Rust backend with memory safety guarantees

## Responsible Disclosure

We follow responsible disclosure practices. We will:
- Give you time to prepare any public disclosure
- Coordinate the timing of public announcements
- Credit you in our security advisories