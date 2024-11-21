import os
import shutil
import json

def substitute_json_files(root_folder):
    """
    Substitutes JSON files in both the public and decks folders with their default versions
    from the default folder. Handles Unicode characters including Japanese text.
    
    Args:
        root_folder (str): The root folder containing 'public', 'decks' and 'default' folders
    """
    # Construct paths for folders
    decks_folder = os.path.join(root_folder, 'srs-quiz-release/srs-quiz/decks')
    public_folder = os.path.join(root_folder, 'srs-quiz-release/srs-quiz/public')
    default_folder = os.path.join(root_folder, 'srs-quiz-release/srs-quiz/defaults')
    
    # Verify folders exist
    for folder in [decks_folder, public_folder, default_folder]:
        if not os.path.exists(folder):
            raise FileNotFoundError(f"Folder not found at: {folder}")
    
    substituted_count = 0
    errors_count = 0
    
    # Process both decks and public folders
    folders_to_process = [
        {'path': decks_folder, 'name': 'decks'},
        {'path': public_folder, 'name': 'public'}
    ]
    
    for folder_info in folders_to_process:
        folder_path = folder_info['path']
        folder_name = folder_info['name']
        
        # Get list of JSON files in current folder
        json_files = [f for f in os.listdir(folder_path) if f.endswith('.json')]
        
        print(f"\nProcessing {folder_name} folder:")
        print("-" * 50)
        
        for file in json_files:
            try:
                # Construct paths
                source_path = os.path.join(folder_path, file)
                default_file = file.replace('.json', '_default.json')
                default_path = os.path.join(default_folder, default_file)
                
                # Check if default file exists
                if os.path.exists(default_path):
                    # Read the default JSON file with proper encoding
                    with open(default_path, 'r', encoding='utf-8') as f:
                        default_data = json.load(f)
                    
                    # Write to source file with proper encoding
                    with open(source_path, 'w', encoding='utf-8') as f:
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
    print("\nFinal Summary:")
    print("=" * 50)
    print(f"Total files processed: {sum(len([f for f in os.listdir(folder['path']) if f.endswith('.json')]) for folder in folders_to_process)}")
    print(f"Successfully substituted: {substituted_count}")
    print(f"Errors/Warnings: {errors_count}")

if __name__ == "__main__":
    try:
        # You can modify this path to your actual root folder path
        root_folder = ".."  
        substitute_json_files(root_folder)
    except Exception as e:
        print(f"[ERROR] Script error: {str(e)}")