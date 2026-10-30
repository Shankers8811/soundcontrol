"""
Replica Skill Package

A skill that provides 11 specialized sub-skills for cloning any app:
recon, architect, design, build, backend, test, diff, entrepreneur, brand, launch, deploy
"""

__version__ = "1.0.0"
__author__ = "Jake Schincariol"
__license__ = "MIT"

from .run import main

__all__ = ["main"]