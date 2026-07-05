"""Extract the full niche taxonomy from Niche_Database.xlsx Sheet4 for use in the VLM prompt."""
import openpyxl
import json

wb = openpyxl.load_workbook(r"C:\Users\DC\Downloads\Niche Database.xlsx", read_only=True)
sheet = wb["Sheet4"]

headers = [cell.value for cell in next(sheet.iter_rows(min_row=1, max_row=1))]
print(f"Headers: {headers}")

# Build taxonomy structure: Category → Macro → Micro → Nano
taxonomy = {}
row_count = 0
for row in sheet.iter_rows(min_row=2, values_only=True):
    cat = str(row[1]).strip() if row[1] else ""
    macro = str(row[2]).strip() if row[2] else ""
    micro = str(row[3]).strip() if row[3] else ""
    # Nano niche might be in column 4 or might not exist
    nano = ""
    if len(row) > 4 and row[4]:
        nano = str(row[4]).strip()
    
    if not cat:
        continue
    
    if cat not in taxonomy:
        taxonomy[cat] = {}
    if macro and macro not in taxonomy[cat]:
        taxonomy[cat][macro] = {}
    if macro and micro:
        if micro not in taxonomy[cat][macro]:
            taxonomy[cat][macro][micro] = []
        if nano and nano not in taxonomy[cat][macro][micro]:
            taxonomy[cat][macro][micro].append(nano)
    
    row_count += 1

wb.close()

print(f"\nTotal rows processed: {row_count}")
print(f"Categories: {len(taxonomy)}")

# Save as JSON for the VLM prompt
with open("niche_taxonomy.json", "w", encoding="utf-8") as f:
    json.dump(taxonomy, f, indent=2, ensure_ascii=False)

# Also create a compact text version for the prompt (more token-efficient)
lines = []
for cat, macros in sorted(taxonomy.items()):
    lines.append(f"\n## {cat}")
    for macro, micros in sorted(macros.items()):
        micro_list = sorted(micros.keys())
        lines.append(f"  Macro: {macro}")
        for micro in micro_list[:10]:  # Limit to keep prompt manageable
            nanos = micros[micro][:5]
            nano_str = f" → [{', '.join(nanos)}]" if nanos else ""
            lines.append(f"    Micro: {micro}{nano_str}")

taxonomy_text = "\n".join(lines)
with open("niche_taxonomy_prompt.txt", "w", encoding="utf-8") as f:
    f.write(taxonomy_text)

print(f"\nSaved: niche_taxonomy.json ({len(json.dumps(taxonomy))} chars)")
print(f"Saved: niche_taxonomy_prompt.txt ({len(taxonomy_text)} chars)")

# Summary
for cat, macros in sorted(taxonomy.items()):
    macro_count = len(macros)
    micro_count = sum(len(m) for m in macros.values())
    print(f"  {cat}: {macro_count} macros, {micro_count} micros")
