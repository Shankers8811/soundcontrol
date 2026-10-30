#!/usr/bin/env python3
"""
Replica Skill - Main entry point

Usage:
    python -m replica <command> [args...]

Commands:
    recon       - Reverse-engineer target app
    architect   - Plan stack, DB, API
    design      - Extract design tokens
    build       - Build screens from recon map
    backend     - Build auth, DB, payments
    test        - Write & run test suite
    diff        - Score clone vs original
    entrepreneur - Analyze reviews -> fixes
    brand       - Name, palette, logo, voice
    launch      - Landing page, store listing
    deploy      - Deploy to production
"""

import sys
from replica.run import main

if __name__ == "__main__":
    main()