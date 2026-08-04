import json

with open("az.json") as f:
    data = json.load(f)

for db in data:
    props = db.get("az_props", {})

    if props.get("enable_trial") == 1:
        print(db["name"])
