def build_prompt(user_query, manuals_dict, max_chars=8000):
    context_parts = []
    total_chars = 0

    for name, text in manuals_dict.items():
        if total_chars >= max_chars:
            break
        chunk = f"\n--- {name} ---\n{text}"
        context_parts.append(chunk)
        total_chars += len(chunk)

    context = "\n".join(context_parts)
    return f"""You are a smart assistant helping airline personnel troubleshoot issues based on technical manuals.

Context:
{context}

Question:
{user_query}
"""
