# Claude Code Style Guide

This document establishes standards for generating professional, human-written code and documentation. Upload this file to Claude Code to ensure consistent, readable output that follows industry best practices.

## Core Principles

### Write Like a Human Developer

Code and documentation should appear as if written by an experienced software engineer, not an AI assistant. This means:

- Natural, conversational tone in documentation without being overly casual
- Professional naming and organization following established conventions
- Clear explanations without excessive verbosity or redundancy
- Appropriate use of comments that explain "why," not just "what"

### Consistency Over Cleverness

Prioritize readability and maintainability over clever or overly compact solutions. Code is read far more often than it is written.

## Code Formatting Standards

### General Rules

- Use consistent indentation (4 spaces for Python, 2 spaces for JavaScript/TypeScript)
- Maximum line length: 100 characters (88 for Python to match Black formatter)
- One statement per line
- Blank lines to separate logical sections, used sparingly
- No trailing whitespace
- Files end with a single newline

### Naming Conventions

#### Variables and Functions
- Use descriptive, pronounceable names
- Prefer full words over abbreviations (except universally recognized ones)
- Variables: `camelCase` (JavaScript/TypeScript) or `snake_case` (Python)
- Functions: `camelCase` (JavaScript/TypeScript) or `snake_case` (Python)
- Constants: `UPPER_SNAKE_CASE` (all languages)
- Classes: `PascalCase` (all languages)

Examples:
```python
# Good
user_count = 42
MAX_CONNECTIONS = 100

def calculate_total_price(items):
    pass

class DatabaseConnection:
    pass
```

```javascript
// Good
const userCount = 42;
const MAX_CONNECTIONS = 100;

function calculateTotalPrice(items) {
    // ...
}

class DatabaseConnection {
    // ...
}
```

#### Files and Directories
- Lowercase with hyphens for multi-word files: `user-service.js`, `database-config.py`
- Alternative: snake_case is also acceptable: `user_service.js`, `database_config.py`
- Choose one style and be consistent throughout the project
- Directories follow the same convention as files

### Import Organization

Group imports in the following order with blank lines between groups:

1. Standard library imports
2. Third-party library imports
3. Local application imports

Example (Python):
```python
import os
import sys
from typing import List, Optional

import requests
import numpy as np

from app.models import User
from app.utils import validate_email
```

Example (JavaScript/TypeScript):
```javascript
import { readFileSync } from 'fs';
import path from 'path';

import express from 'express';
import axios from 'axios';

import { User } from './models/user';
import { validateEmail } from './utils/validation';
```

## Documentation Standards

### Never Use Emojis

Emojis have no place in professional code or documentation. They appear unprofessional and can cause issues with certain tools and systems.

```markdown
❌ Bad: "## 🚀 Getting Started"
✅ Good: "## Getting Started"

❌ Bad: "# Installation 📦"
✅ Good: "# Installation"

❌ Bad: "console.log('Done! ✨');"
✅ Good: "console.log('Setup complete');"
```

### Capitalization

Use sentence case for headings and documentation, not title case with every word capitalized.

```markdown
❌ Bad: "## How To Install And Configure The Application"
✅ Good: "## How to install and configure the application"

❌ Bad: "### Setting Up Your Development Environment"
✅ Good: "### Setting up your development environment"
```

Exception: Proper nouns and acronyms remain capitalized (GitHub, API, PostgreSQL).

### Documentation Structure

#### README Files

A professional README should include:

1. Project name and brief description (1-2 sentences)
2. Installation instructions
3. Basic usage examples
4. Configuration (if applicable)
5. Contributing guidelines (for open source)
6. License information

Structure example:
```markdown
# Project Name

Brief description of what this project does and who it's for.

## Installation

Step-by-step installation instructions.

## Usage

Basic usage examples with code snippets.

## Configuration

Environment variables and configuration options.

## Development

Instructions for setting up a development environment.

## License

License information.
```

#### Code Comments

Write comments that explain why code exists, not what it does. The code itself should be clear enough to show what it does.

```python
# Bad: States the obvious
i = i + 1  # Increment i by 1

# Good: Explains purpose
i += 1  # Move to next array position for batch processing
```

```python
# Bad: Redundant
username = user.get_name()  # Get the user's name

# Good: Adds context
username = user.get_name()  # Cache name for repeated display formatting
```

Comment style by language:
- Python: Use `#` for single-line, `"""triple quotes"""` for docstrings
- JavaScript/TypeScript: Use `//` for single-line, `/* */` for multi-line
- Never use commented-out code in production; use version control instead

### Docstrings and Function Documentation

#### Python

Use clear docstrings following this format:

```python
def calculate_discount(price: float, discount_rate: float) -> float:
    """
    Calculate the final price after applying a discount.
    
    Args:
        price: Original price before discount
        discount_rate: Discount percentage as decimal (0.1 for 10%)
    
    Returns:
        Final price after discount applied
    
    Raises:
        ValueError: If price is negative or discount_rate is not between 0 and 1
    """
    if price < 0:
        raise ValueError("Price cannot be negative")
    if not 0 <= discount_rate <= 1:
        raise ValueError("Discount rate must be between 0 and 1")
    
    return price * (1 - discount_rate)
```

#### JavaScript/TypeScript

Use JSDoc format:

```javascript
/**
 * Calculate the final price after applying a discount.
 * 
 * @param {number} price - Original price before discount
 * @param {number} discountRate - Discount percentage as decimal (0.1 for 10%)
 * @returns {number} Final price after discount applied
 * @throws {Error} If price is negative or discountRate is not between 0 and 1
 */
function calculateDiscount(price, discountRate) {
    if (price < 0) {
        throw new Error('Price cannot be negative');
    }
    if (discountRate < 0 || discountRate > 1) {
        throw new Error('Discount rate must be between 0 and 1');
    }
    
    return price * (1 - discountRate);
}
```

## File Organization

### Project Structure

Organize projects with clear, logical structure:

```
project-name/
├── src/
│   ├── models/
│   ├── services/
│   ├── utils/
│   └── index.js
├── tests/
│   ├── unit/
│   └── integration/
├── docs/
├── .gitignore
├── package.json
├── README.md
└── LICENSE
```

For Python:
```
project-name/
├── src/
│   └── project_name/
│       ├── __init__.py
│       ├── models/
│       ├── services/
│       └── utils/
├── tests/
├── docs/
├── requirements.txt
├── setup.py
├── README.md
└── LICENSE
```

### File Length

- Keep files under 500 lines when possible
- If a file exceeds 500 lines, consider splitting into logical modules
- Single Responsibility Principle: each file should have one clear purpose

## Language-Specific Standards

### Python

Follow PEP 8 with these key points:

- Use 4 spaces for indentation
- Imports at the top of the file
- Two blank lines between top-level definitions
- One blank line between method definitions
- Use type hints for function signatures

```python
from typing import List, Optional


def process_users(user_ids: List[int], active_only: bool = True) -> List[dict]:
    """Process and return user data for given IDs."""
    results = []
    
    for user_id in user_ids:
        user = fetch_user(user_id)
        if not active_only or user.is_active:
            results.append(user.to_dict())
    
    return results


def fetch_user(user_id: int) -> Optional[User]:
    """Retrieve a user by ID from the database."""
    # Implementation here
    pass
```

### JavaScript/TypeScript

- Use 2 spaces for indentation
- Use `const` by default, `let` when reassignment needed, never `var`
- Prefer arrow functions for callbacks
- Use template literals for string interpolation
- Semicolons are required

```javascript
const fetchUsers = async (userIds, activeOnly = true) => {
    const results = [];
    
    for (const userId of userIds) {
        const user = await fetchUser(userId);
        if (!activeOnly || user.isActive) {
            results.push(user.toObject());
        }
    }
    
    return results;
};

const fetchUser = async (userId) => {
    // Implementation here
};
```

### TypeScript

Add type annotations for better code clarity:

```typescript
interface User {
    id: number;
    name: string;
    email: string;
    isActive: boolean;
}

const fetchUsers = async (
    userIds: number[], 
    activeOnly: boolean = true
): Promise<User[]> => {
    const results: User[] = [];
    
    for (const userId of userIds) {
        const user = await fetchUser(userId);
        if (!activeOnly || user.isActive) {
            results.push(user);
        }
    }
    
    return results;
};
```

## Error Handling

### Write Helpful Error Messages

Error messages should be clear, specific, and actionable:

```python
# Bad
raise ValueError("Invalid input")

# Good
raise ValueError(
    f"Expected discount_rate between 0 and 1, got {discount_rate}. "
    "Please provide a decimal value (e.g., 0.15 for 15%)."
)
```

### Don't Blame the User

Frame error messages constructively:

```python
# Bad
raise ValueError("You entered an invalid email address")

# Good
raise ValueError(
    f"Email address '{email}' is not valid. "
    "Expected format: user@example.com"
)
```

## Testing

### Test File Organization

- Place tests in a separate `tests/` directory
- Mirror the source code structure
- Name test files with `test_` prefix (Python) or `.test.` suffix (JavaScript)

```
src/
  └── services/
      └── user_service.py
tests/
  └── services/
      └── test_user_service.py
```

### Test Naming

Use descriptive test names that explain what is being tested:

```python
# Bad
def test_user():
    pass

# Good
def test_user_creation_with_valid_email():
    pass

def test_user_creation_raises_error_with_invalid_email():
    pass
```

```javascript
// Bad
test('user test', () => {});

// Good
test('creates user successfully with valid email', () => {});

test('throws error when email is invalid', () => {});
```

## Configuration Files

### Keep Configuration Simple

Configuration files should be straightforward and well-commented:

```yaml
# config.yaml - Application configuration

database:
  host: localhost
  port: 5432
  name: myapp_db
  # Connection pool settings
  pool_size: 10
  max_overflow: 20

logging:
  level: INFO
  format: "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
  
# API rate limiting
rate_limit:
  requests_per_minute: 60
  burst_size: 10
```

### Environment Variables

Use descriptive names for environment variables:

```bash
# Bad
DB_H=localhost
DB_P=5432

# Good
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=myapp_production
DATABASE_USER=myapp_user
DATABASE_PASSWORD=secure_password_here
```

## Git Commit Messages

Write clear, descriptive commit messages:

```
# Bad
fix bug
update code
changes

# Good
fix: correct email validation regex pattern

feat: add user authentication with JWT tokens

refactor: extract database connection logic into separate module

docs: update installation instructions for Python 3.11
```

Format: `type(scope): brief description`

Common types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

## Common Antipatterns to Avoid

### Overly Formatted Documentation

Do not over-format with excessive bolding, capitalization, or special characters:

```markdown
❌ Bad:
# 🎉 WELCOME TO MY AWESOME PROJECT 🎉

**THIS** is a **SUPER IMPORTANT** project that does **AMAZING** things!!!

✨ Features ✨
🚀 Fast
💪 Powerful
🔥 Hot

✅ Good:
# My Project

A fast and reliable tool for data processing.

## Features

- High-performance data pipeline
- Simple configuration
- Extensive test coverage
```

### Magic Numbers

Avoid unexplained numbers in code:

```python
# Bad
if user.age < 18:
    return False

# Good
MINIMUM_AGE = 18

if user.age < MINIMUM_AGE:
    return False
```

### Deep Nesting

Avoid excessive nesting by using early returns:

```python
# Bad
def process_order(order):
    if order is not None:
        if order.is_valid():
            if order.total > 0:
                if order.user.is_active:
                    return complete_order(order)
    return None

# Good
def process_order(order):
    if order is None:
        return None
    
    if not order.is_valid():
        return None
    
    if order.total <= 0:
        return None
    
    if not order.user.is_active:
        return None
    
    return complete_order(order)
```

### Commented-Out Code

Never leave commented-out code in the repository:

```python
# Bad
def calculate_total(items):
    total = sum(item.price for item in items)
    # discount = total * 0.1
    # tax = total * 0.08
    # return total - discount + tax
    return total

# Good
def calculate_total(items):
    return sum(item.price for item in items)
```

## Best Practices Summary

1. **No emojis** in any code or documentation
2. **Sentence case** for headings and documentation
3. **Consistent naming** following language conventions
4. **Clear comments** that explain "why," not "what"
5. **Logical organization** with intuitive file structure
6. **Type hints** where supported (Python, TypeScript)
7. **Error messages** that are specific and actionable
8. **Tests** with descriptive names
9. **Simple configuration** with helpful comments
10. **Human-readable** code that prioritizes clarity

## Checklist for Code Review

Before submitting code, verify:

- [ ] No emojis anywhere in code or documentation
- [ ] All headings use sentence case
- [ ] Variable and function names are descriptive and follow conventions
- [ ] Comments explain "why," not "what"
- [ ] No commented-out code
- [ ] Imports are organized properly
- [ ] Error messages are clear and helpful
- [ ] Tests have descriptive names
- [ ] Code follows consistent formatting
- [ ] README is clear and complete
- [ ] No magic numbers (use named constants)
- [ ] Maximum nesting depth of 3-4 levels
- [ ] Files are under 500 lines when possible

## References

This guide synthesizes best practices from:

- PEP 8 (Python Style Guide)
- Google Developer Documentation Style Guide
- MDN Web Docs Code Style Guide
- Airbnb JavaScript Style Guide
- Professional software engineering standards

Remember: code is written once but read many times. Prioritize clarity and maintainability over cleverness or brevity.
