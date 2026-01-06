import zipfile
import os
import json

def create_dist_zip():
    # Use the id from manifest.json as the directory name
    dist_dir = 'obsidian-mcp-gemini3'
    zip_filename = f'{dist_dir}.zip'
    files_to_include = ['main.js', 'manifest.json', 'styles.css']
    
    print(f"Creating {zip_filename}...")
    
    with zipfile.ZipFile(zip_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for file in files_to_include:
            if os.path.exists(file):
                # Write file into the subdirectory in the zip
                zipf.write(file, arcname=os.path.join(dist_dir, file))
                print(f"  Added {file} as {os.path.join(dist_dir, file)}")
            else:
                print(f"  Warning: {file} not found, skipping.")

    print("Done.")

if __name__ == "__main__":
    create_dist_zip()
