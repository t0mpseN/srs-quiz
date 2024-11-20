import os
import shutil
import json

def substitute_json_files(root_folder):
    """
    Substitutes JSON files in the public subfolder with their default versions
    from the default folder. Handles Unicode characters including Japanese text.
    
    Args:
        root_folder (str): The root folder containing both 'public' and 'default' folders
    """
    # Construct paths for public and default folders
    public_folder = os.path.join(root_folder, 'srs-quiz-main/decks')
    default_folder = os.path.join(root_folder, 'srs-quiz-main/default')
    
    # Verify folders exist
    if not os.path.exists(public_folder):
        raise FileNotFoundError(f"Public folder not found at: {public_folder}")
    if not os.path.exists(default_folder):
        raise FileNotFoundError(f"Default folder not found at: {default_folder}")
    
    # Get list of JSON files in public folder
    public_files = [f for f in os.listdir(public_folder) if f.endswith('.json')]
    
    substituted_count = 0
    errors_count = 0
    
    for file in public_files:
        try:
            # Construct paths
            public_path = os.path.join(public_folder, file)
            default_file = file.replace('.json', '_default.json')
            default_path = os.path.join(default_folder, default_file)
            
            # Check if default file exists
            if os.path.exists(default_path):
                # Read the default JSON file with proper encoding
                with open(default_path, 'r', encoding='utf-8') as f:
                    default_data = json.load(f)
                
                # Write to public file with proper encoding
                with open(public_path, 'w', encoding='utf-8') as f:
                    json.dump(default_data, f, ensure_ascii=False, indent=2)
                
                print(f"[OK] Successfully substituted {file} with {default_file}")
                substituted_count += 1
            else:
                print(f"[WARNING] Default file {default_file} not found in {default_folder}")
                errors_count += 1
                
        except Exception as e:
            print(f"[ERROR] Processing {file}: {str(e)}")
            errors_count += 1
    
    # Print summary
    print("\nSummary:")
    print(f"Total files processed: {len(public_files)}")
    print(f"Successfully substituted: {substituted_count}")
    print(f"Errors/Warnings: {errors_count}")

if __name__ == "__main__":
    try:
        # You can modify this path to your actual root folder path
        root_folder = ".."  
        substitute_json_files(root_folder)
    except Exception as e:
        print(f"[ERROR] Script error: {str(e)}")