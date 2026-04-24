import re
import base64
import json
import urllib.request
import os

def encode_mermaid(code):
    data = {
        "code": code,
        "mermaid": {"theme": "default"}
    }
    json_str = json.dumps(data)
    return base64.urlsafe_b64encode(json_str.encode('utf-8')).decode('utf-8')

def download_mermaid_images(file_path):
    with open(file_path, 'r') as f:
        content = f.read()

    # Create images directory
    img_dir = os.path.join(os.path.dirname(file_path), "report_images")
    if not os.path.exists(img_dir):
        os.makedirs(img_dir)

    # Match ```mermaid ... ```
    pattern = re.compile(r'```mermaid\n(.*?)\n```', re.DOTALL)
    
    diagrams = pattern.findall(content)
    
    new_content = content
    for i, code in enumerate(diagrams):
        code = code.strip()
        encoded = encode_mermaid(code)
        url = f"https://mermaid.ink/img/{encoded}"
        
        img_filename = f"diagram_{i+1}.png"
        img_path = os.path.join(img_dir, img_filename)
        
        print(f"Downloading {url} to {img_path}...")
        try:
            # Add a user agent to avoid being blocked
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req) as response, open(img_path, 'wb') as out_file:
                out_file.write(response.read())
            
            # Replace in content
            # We need to be careful to only replace this specific instance
            # We'll use a temporary placeholder
            placeholder = f"```mermaid\n{code}\n```"
            new_content = new_content.replace(placeholder, f"![Diagram {i+1}](./report_images/{img_filename})")
        except Exception as e:
            print(f"Failed to download {img_filename}: {e}")

    output_path = file_path.replace('.md', '_offline.md')
    with open(output_path, 'w') as f:
        f.write(new_content)
    return output_path

if __name__ == "__main__":
    path1 = "/Users/abhinavvishwakarma/work/JPL/ad-track/BTech_Thesis_Chapters_1_to_4.md"
    path2 = "/Users/abhinavvishwakarma/work/JPL/ad-track/Project_Report.md"
    
    out1 = download_mermaid_images(path1)
    out2 = download_mermaid_images(path2)
    print(f"Created: {out1}")
    print(f"Created: {out2}")
