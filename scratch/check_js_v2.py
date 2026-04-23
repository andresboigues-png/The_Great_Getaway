import re

def check_js_syntax(file_path):
    with open(file_path, 'r') as f:
        content = f.read()
    
    # Remove comments
    content = re.sub(r'//.*', '', content)
    content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)
    
    # Remove strings
    content = re.sub(r'"([^"\\]|\\.)*"', '""', content)
    content = re.sub(r"'([^'\\]|\\.)*'", "''", content)
    content = re.sub(r'`([^`\\]|\\.)*`', '``', content, flags=re.DOTALL)
    
    stack = []
    pairs = {'(': ')', '[': ']', '{': '}'}
    
    for i, char in enumerate(content):
        if char in pairs.keys():
            stack.append((char, i))
        elif char in pairs.values():
            if not stack:
                return f"Unmatched closing '{char}' at position around {i}"
            top, pos = stack.pop()
            if pairs[top] != char:
                return f"Mismatched '{top}' at {pos} and '{char}' at {i}"
    
    if stack:
        top, pos = stack.pop()
        return f"Unmatched opening '{top}' at position around {pos}"
    
    return "OK"

print(check_js_syntax("/Users/andres.boigues/Documents/Code4All/AntiGravity projects/Work project- delivery/frontend/static/js/app.js"))
