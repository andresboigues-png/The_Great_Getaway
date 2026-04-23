import re

def check_js_syntax(file_path):
    with open(file_path, 'r') as f:
        original_content = f.read()
    
    content = original_content
    # Instead of removing, let's replace with spaces to keep indices
    
    def replace_with_spaces(match):
        return ' ' * len(match.group(0))

    content = re.sub(r'//.*', replace_with_spaces, content)
    content = re.sub(r'/\*.*?\*/', replace_with_spaces, content, flags=re.DOTALL)
    content = re.sub(r'"([^"\\]|\\.)*"', replace_with_spaces, content)
    content = re.sub(r"'([^'\\]|\\.)*'", replace_with_spaces, content)
    content = re.sub(r'`([^`\\]|\\.)*`', replace_with_spaces, content, flags=re.DOTALL)
    
    stack = []
    pairs = {'(': ')', '[': ']', '{': '}'}
    
    for i, char in enumerate(content):
        if char in pairs.keys():
            stack.append((char, i))
        elif char in pairs.values():
            if not stack:
                print(f"Unmatched closing '{char}' at index {i}")
                print(original_content[max(0, i-50):min(len(original_content), i+50)])
                return
            top, pos = stack.pop()
            if pairs[top] != char:
                print(f"Mismatched '{top}' at index {pos} and '{char}' at index {i}")
                print("--- Start ---")
                print(original_content[max(0, pos-50):min(len(original_content), pos+50)])
                print("--- End ---")
                print(original_content[max(0, i-50):min(len(original_content), i+50)])
                return
    
    if stack:
        top, pos = stack.pop()
        print(f"Unmatched opening '{top}' at index {pos}")
        print(original_content[max(0, pos-50):min(len(original_content), pos+50)])
    else:
        print("OK")

check_js_syntax("/Users/andres.boigues/Documents/Code4All/AntiGravity projects/Work project- delivery/frontend/static/js/app.js")
