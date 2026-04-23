import ast
import sys

file_path = "/Users/andres.boigues/Documents/Code4All/AntiGravity projects/Work project- delivery/frontend/static/js/app.js"
with open(file_path, 'r') as f:
    content = f.read()

# Since it's JS, we can't use ast.parse. 
# But we can try to find unmatched braces.

def check_braces(code):
    stack = []
    braces = {'(': ')', '[': ']', '{': '}'}
    for i, char in enumerate(code):
        if char in braces.keys():
            stack.append((char, i))
        elif char in braces.values():
            if not stack:
                return f"Unmatched closing brace '{char}' at index {i}"
            top, pos = stack.pop()
            if braces[top] != char:
                return f"Mismatched braces '{top}' at {pos} and '{char}' at {i}"
    if stack:
        top, pos = stack.pop()
        return f"Unmatched opening brace '{top}' at index {pos}"
    return "No obvious brace issues"

# Note: this doesn't account for quotes or comments, but it's a start.
print(check_braces(content))
