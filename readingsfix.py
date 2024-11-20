import json
import re

def clean_readings(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    for item in data:
        if 'Reading' in item:
            reading = item['Reading']
            # Extract all parts maintaining order
            pattern = r'\[([\u3040-\u309F]+)\]|(?<!\[)([\u3040-\u309F]+)(?!\])'
            matches = re.finditer(pattern, reading)
            
            # Get all hiragana parts in order
            parts = []
            for match in matches:
                # Group 1 is bracketed content, Group 2 is standalone hiragana
                part = match.group(1) if match.group(1) else match.group(2)
                parts.append(part)
            
            clean_reading = ''.join(parts)
            # Remove any kanji characters that might have been captured
            clean_reading = re.sub(r'[^\u3040-\u309F]', '', clean_reading)
            item['Reading'] = clean_reading
    
    with open(file_path.replace('.json', '_cleaned.json'), 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4)

clean_readings(r'default\deck_default.json')