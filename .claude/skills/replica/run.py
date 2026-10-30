#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Replica Skill Runner

Usage:
    python -m replica [command] [args...]

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
import os
import subprocess

SKILLS = {
    "recon": "replica-recon",
    "architect": "replica-architect",
    "design": "replica-design",
    "build": "replica-build",
    "backend": "replica-backend",
    "test": "replica-test",
    "diff": "replica-diff",
    "entrepreneur": "replica-entrepreneur",
    "brand": "replica-brand",
    "launch": "replica-launch",
    "deploy": "replica-deploy",
}

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    command = sys.argv[1]
    args = sys.argv[2:]

    if command == "help" or command == "-h" or command == "--help":
        print(__doc__)
        return

    if command == "list":
        print("Available commands:")
        for cmd, skill in SKILLS.items():
            print(f"  {cmd:12} - {skill}")
        return

    if command not in SKILLS:
        print(f"Unknown command: {command}")
        print(f"Available: {', '.join(SKILLS.keys())}")
        sys.exit(1)

    skill = SKILLS[command]

    # Check if we're running as a plugin or local skill
    skill_path = os.path.join(os.path.dirname(__file__), f"replica-{command}")

    if os.path.exists(skill_path):
        # Run local skill
        skill_script = os.path.join(skill_path, "run.py")
        if os.path.exists(skill_path):
            os.chdir(skill_path)
            subprocess.run([sys.executable, "run.py"] + args)
        else:
            print(f"Skill not found at {skill_path}")
            sys.exit(1)
    else:
        print(f"Skill {command} not installed locally.")
        print("Install with: git clone https://github.com/Jakeschincariol/replica-skill.git")
        print("Then: cp -r replica-skill/replica-* ~/.claude/skills/")
        sys.exit(1)

if __name__ == "__main__":
    main()