import re
import base64
import json

def encode_mermaid(code):
    # Standard mermaid.ink expects a JSON with the code
    data = {
        "code": code,
        "mermaid": {"theme": "default"}
    }
    json_str = json.dumps(data)
    # Encode to base64
    return base64.urlsafe_b64encode(json_str.encode('utf-8')).decode('utf-8')

def replace_mermaid_with_images(file_path):
    with open(file_path, 'r') as f:
        content = f.read()

    # Match ```mermaid ... ```
    pattern = re.compile(r'```mermaid\n(.*?)\n```', re.DOTALL)
    
    def replacer(match):
        code = match.group(1).strip()
        encoded = encode_mermaid(code)
        # Using .png for better compatibility with exports
        url = f"https://mermaid.ink/img/{encoded}"
        return f"![Mermaid Diagram]({url})"

    new_content = pattern.sub(replacer, content)
    
    output_path = file_path.replace('.md', '_with_images.md')
    with open(output_path, 'w') as f:
        f.write(new_content)
    return output_path

if __name__ == "__main__":
    path1 = "/Users/abhinavvishwakarma/work/JPL/ad-track/BTech_Thesis_Chapters_1_to_4.md"
    path2 = "/Users/abhinavvishwakarma/work/JPL/ad-track/Project_Report.md"
    
    out1 = replace_mermaid_with_images(path1)
    out2 = replace_mermaid_with_images(path2)
    print(f"Created: {out1}")
    print(f"Created: {out2}")
