import json
import os

def modify_json_file(input_file, output_file=None):
    """
    Modifies a JSON file by swapping Word and Meaning properties and emptying Reading.
    
    Args:
        input_file (str): Path to input JSON file
        output_file (str, optional): Path to output JSON file. If None, will append '_modified' to input filename
    """
    try:
        # Read the JSON file
        with open(input_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Create a backup of the original file
        backup_file = input_file.replace('.json', '_backup.json')
        with open(backup_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=4)
        
        print(f"Created backup at: {backup_file}")
        
        # Modify each object in the data
        for item in data:
            # Store original values
            original_word = item["Word"]
            original_meaning = item["Meaning"]
            
            # Swap Word and Meaning
            item["Word"] = original_meaning
            item["Meaning"] = original_word
            
            # Empty the Reading
            item["Reading"] = ""
        
        # Determine output file name
        if output_file is None:
            output_file = input_file.replace('.json', '_modified.json')
        
        # Save the modified data
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=4)
        
        print(f"Successfully modified {len(data)} items")
        print(f"Modified file saved as: {output_file}")
        
        # Show example of modifications
        print("\nExample of modifications:")
        print("Original first item in backup:")
        with open(backup_file, 'r', encoding='utf-8') as f:
            original = json.load(f)
            print(json.dumps(original[0], ensure_ascii=False, indent=4))
        
        print("\nModified first item:")
        print(json.dumps(data[0], ensure_ascii=False, indent=4))
        
    except FileNotFoundError:
        print(f"Error: File '{input_file}' not found")
    except json.JSONDecodeError:
        print(f"Error: File '{input_file}' is not valid JSON")
    except Exception as e:
        print(f"Error: {str(e)}")

def main():
    # Get all JSON files in the current directory
    json_files = [f for f in os.listdir('.') if f.endswith('.json')]
    
    if not json_files:
        print("No JSON files found in current directory")
        return
    
    print("Available JSON files:")
    for i, file in enumerate(json_files, 1):
        print(f"{i}. {file}")
    
    try:
        selection = int(input("\nEnter the number of the file you want to modify: ")) - 1
        if 0 <= selection < len(json_files):
            file_to_modify = json_files[selection]
            modify_json_file(file_to_modify)
        else:
            print("Invalid selection")
    except ValueError:
        print("Please enter a valid number")

if __name__ == "__main__":
    main()