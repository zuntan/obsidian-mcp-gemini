import zipfile
import os
import json

def create_dist_zip():
    # Use the id from manifest.json as the directory name
    dist_dir = 'obsidian-mcp-gemini3'
    zip_filename = 'obsidian-mcp-gemini3.zip'
    base_dir = 'obsidian-mcp-gemini3'
    
    print(f"Creating {zip_filename}...")
    # Define files/folders to include
    include_files = ['main.js', 'manifest.json', 'styles.css']
    include_dirs = ['tcp-bridge']
    
    # Create the zip file
    with zipfile.ZipFile(zip_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
        # Add individual files
        for file in include_files:
            if os.path.exists(file):
                zip_path = os.path.join(base_dir, file)
                zipf.write(file, zip_path)
                print(f"  Added {file} as {zip_path}")
            else:
                print(f"  Warning: {file} not found, skipping.")
        
        # Add directories
        for dir_name in include_dirs:
            if os.path.exists(dir_name):
                for root, dirs, files in os.walk(dir_name):
                    for file in files:
                        file_path = os.path.join(root, file)
                        # Calculate relative path for zip structure
                        rel_path = os.path.relpath(file_path, os.getcwd())
                        zip_path = os.path.join(base_dir, rel_path)
                        zipf.write(file_path, zip_path)
                        print(f"  Added {file_path} as {zip_path}")
            else:
                print(f"  Warning: Directory {dir_name} not found, skipping.")

    print("Done.")

if __name__ == "__main__":
    create_dist_zip()
