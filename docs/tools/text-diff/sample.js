/* Sample for Text Diff Online: two versions of a small Python script. */
export const SAMPLE = {
"a": {
"name": "report_v1.py",
"data": "\"\"\"Send the weekly sales report by email.\"\"\"\nimport csv\nimport smtplib\nfrom email.message import EmailMessage\n\nSMTP_HOST = \"mail.example.com\"\nRECIPIENTS = [\"sales@example.com\"]\n\n\ndef load_rows(path):\n    with open(path, newline=\"\") as f:\n        return list(csv.DictReader(f))\n\n\ndef total(rows):\n    return sum(float(r[\"amount\"]) for r in rows)\n\n\ndef build_message(rows):\n    msg = EmailMessage()\n    msg[\"Subject\"] = \"Weekly sales report\"\n    msg[\"To\"] = \", \".join(RECIPIENTS)\n    msg.set_content(f\"Orders: {len(rows)}\\nTotal: {total(rows):.2f}\")\n    return msg\n\n\ndef main():\n    rows = load_rows(\"sales.csv\")\n    with smtplib.SMTP(SMTP_HOST) as s:\n        s.send_message(build_message(rows))\n\n\nif __name__ == \"__main__\":\n    main()\n"
},
"b": {
"name": "report_v2.py",
"data": "\"\"\"Send the weekly sales report by email.\"\"\"\nimport csv\nimport smtplib\nimport sys\nfrom email.message import EmailMessage\n\nSMTP_HOST = \"smtp.example.com\"\nSMTP_PORT = 587\nRECIPIENTS = [\"sales@example.com\", \"finance@example.com\"]\n\n\ndef load_rows(path):\n    with open(path, newline=\"\", encoding=\"utf-8\") as f:\n        return list(csv.DictReader(f))\n\n\ndef total(rows):\n    return sum(float(r[\"amount\"]) for r in rows if r.get(\"status\") != \"refunded\")\n\n\ndef build_message(rows, week):\n    msg = EmailMessage()\n    msg[\"Subject\"] = f\"Sales report, week {week}\"\n    msg[\"To\"] = \", \".join(RECIPIENTS)\n    msg.set_content(f\"Orders: {len(rows)}\\nTotal: {total(rows):.2f}\")\n    return msg\n\n\ndef main():\n    week = sys.argv[1] if len(sys.argv) > 1 else \"this week\"\n    rows = load_rows(\"sales.csv\")\n    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as s:\n        s.starttls()\n        s.send_message(build_message(rows, week))\n\n\nif __name__ == \"__main__\":\n    main()\n"
}
};
