import json

# Your JSON data (could also be read from a file)
with open('deck_default.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# Function to update values in the JSON data
def update_properties(data):
    for obj in data:
        # Update the properties with the desired values
        if obj['Balance'] == "0":
            obj['Balance'] = 0  # Change "0" to numeric 0
        if obj['Interval'] == "0":
            obj['Interval'] = 0  # Change "0" to numeric 0
        if obj['EF'] == "2.5":
            obj['EF'] = 2.5  # Change "2.5" to numeric 2.5
        if obj['LastReviewed'] == "0":
            obj['LastReviewed'] = 0  # Change "0" to numeric 0
        if obj['NextReview'] == "0":
            obj['NextReview'] = 0  # Change "0" to numeric 0

    return data

# Update the data
updated_data = update_properties(data)

# Print the updated data
#print(json.dumps(updated_data, ensure_ascii=False, indent=4))

# Optionally, write the updated data back to a file
with open('deck_default.json', 'w', encoding='utf-8') as f:
    json.dump(updated_data, f, ensure_ascii=False, indent=4)
