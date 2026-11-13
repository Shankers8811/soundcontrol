# Contributing to SoundControl

Thank you for considering contributing to SoundControl! This is a desktop companion app for Anker/Soundcore devices built with Rust + Tauri v2.

## Getting Started

### Prerequisites

- Rust toolchain (latest stable)
- Node.js 18+
- Tauri CLI (`cargo install tauri-cli`)
- Git

### Development Setup

```bash
# Clone the repository
git clone https://github.com/Shankers8811/soundcontrol.git
cd soundcontrol

# Install frontend dependencies
npm install

# Run in development mode
npm run tauri:dev

# Build for production
npm run tauri:build
```

## Project Structure

```
soundcontrol/
├── src/                          # Frontend (React + TypeScript)
│   ├── components/               # UI components
│   ├── pages/                    # Application pages
│   ├── stores/                   # Zustand state management
│   ├── api/                      # Tauri command wrappers
│   ├── types.ts                  # TypeScript type definitions
│   ├── App.tsx                   # Main app component
│   └── main.tsx                  # Entry point
├── src-tauri/                    # Backend (Rust)
│   ├── src/
│   │   ├── bluetooth/            # Bluetooth management (WinRT/BlueZ)
│   │   ├── commands/             # Tauri commands
│   │   ├── db/                   # SQLite database
│   │   ├── protocol/             # Soundcore CMF protocol
│   │   ├── tasks/                # Background tasks
│   │   └── utils/                # Utility functions
│   ├── Cargo.toml                # Rust dependencies
│   └── tauri.conf.json           # Tauri configuration
├── devices.toml                  # Device profile database (110+ devices)
├── migrations.sql                # Database schema
└── package.json                  # Frontend dependencies
```

## How to Contribute

### 1. Fork the Repository

Fork the repository to your own GitHub account.

### 2. Create a Branch

```bash
git checkout -b feature/your-feature-name
```

### 3. Make Your Changes

Make your changes and test them locally:

```bash
# Run the app
npm run tauri:dev

# Check TypeScript
npx tsc --noEmit

# Check Rust
cd src-tauri && cargo check
```

### 4. Commit Your Changes

```bash
git add .
git commit -m "feat: your feature description"
```

### 5. Push and Create a Pull Request

```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub.

## Coding Standards

### Rust
- Follow [Rust API conventions](https://rust-lang.github.io/api-guidelines/)
- Use `clippy` for linting
- Format with `rustfmt`
- No `unwrap()` in production code (use proper error handling)

### TypeScript/React
- Use TypeScript strict mode
- Follow existing component patterns
- Use Zustand for state management
- Use Tailwind CSS for styling

### Commit Messages

Use conventional commits:
```
feat: add new feature
fix: bug fix
docs: documentation changes
style: formatting changes
refactor: code refactoring
test: adding tests
chore: maintenance tasks
```

## Reporting Bugs

Please use the issue templates to report bugs. Include:
- Steps to reproduce
- Expected behavior
- Actual behavior
- Device model (if relevant)
- Operating system
- SoundControl version

## Feature Requests

Use the feature request issue template to suggest new features. Please check
existing issues first to avoid duplicates.

## Code Review

All pull requests will be reviewed by maintainers. Please:
- Keep PRs small and focused
- Write clear descriptions
- Update documentation if needed
- Add tests for new features

## License

By contributing to SoundControl, you agree that your contributions will be
licensed under the MIT License.

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).
