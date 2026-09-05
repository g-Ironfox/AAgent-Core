from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles


ROOT = Path(__file__).resolve().parent
DATA_FILE = ROOT / "data" / "workflow.json"
STATIC_DIR = ROOT / "static"


SEED_WORKFLOW: list[dict[str, Any]] = [
    {
        "type": "input",
        "name": "Input",
        "input": [],
        "output": [
            {"label": "content", "source": "const", "const": "", "type": "content"}
        ],
        "input_value": [],
        "arguments": {},
        "control_predecessors": [],
        "control_successors": [1],
    },
    {
        "type": "llm",
        "name": "Summarizer",
        "input": [
            {"label": "prompt", "source": "const", "const": "Summarize the input.", "type": "content"},
            {"label": "model", "source": "const", "const": "deepseek-flash-v4", "type": "content"},
            {"label": "think", "source": "const", "const": False, "type": "boolean"},
            {"label": "tools", "source": "const", "const": [], "type": "list-json"},
            {"label": "context", "source": "port", "port": [0, 0], "type": "content"},
        ],
        "output": [{"label": "output", "source": "port", "port": None, "type": "content"}],
        "input_value": ["Summarize the input.", "deepseek-flash-v4", False, [], ""],
        "arguments": {},
        "control_predecessors": [0],
        "control_successors": [2],
    },
    {
        "type": "output",
        "name": "Output",
        "input": [{"label": "content", "source": "port", "port": [1, 0], "type": "content"}],
        "output": [],
        "input_value": [""],
        "arguments": {},
        "control_predecessors": [1],
        "control_successors": [],
    },
]


app = FastAPI(title="AAgent Workflow Editor")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


def ensure_data_file() -> None:
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not DATA_FILE.exists():
        DATA_FILE.write_text(json.dumps(SEED_WORKFLOW, ensure_ascii=False, indent=2), encoding="utf-8")


def read_workflow() -> list[dict[str, Any]]:
    ensure_data_file()
    try:
        value = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail=f"workflow 文件不可读: {exc}") from exc
    validate_workflow(value)
    return value


def validate_workflow(workflow: Any) -> None:
    if not isinstance(workflow, list):
        raise HTTPException(status_code=422, detail="workflow 必须是数组")
    for index, node in enumerate(workflow):
        if not isinstance(node, dict):
            raise HTTPException(status_code=422, detail=f"节点 {index} 必须是 JSON 对象")
        for key in ("type", "name", "input", "output", "input_value", "arguments", "control_predecessors", "control_successors"):
            if key not in node:
                raise HTTPException(status_code=422, detail=f"节点 {index} 缺少字段 {key}")
        if not isinstance(node["input"], list) or not isinstance(node["output"], list):
            raise HTTPException(status_code=422, detail=f"节点 {index} 的 input/output 必须是数组")
        if not isinstance(node["input_value"], list):
            raise HTTPException(status_code=422, detail=f"节点 {index} 的 input_value 必须是数组")
        for port_index, port in enumerate(node["input"]):
            if not isinstance(port, dict) or not isinstance(port.get("label"), str) or not isinstance(port.get("type"), str):
                raise HTTPException(status_code=422, detail=f"节点 {index} input {port_index} 格式无效")
            if port.get("source") not in {"const", "port"}:
                raise HTTPException(status_code=422, detail=f"节点 {index} input {port_index} source 无效")
            if port["source"] == "port":
                reference = port.get("port")
                if not isinstance(reference, list) or len(reference) != 2 or not all(isinstance(item, int) for item in reference):
                    raise HTTPException(status_code=422, detail=f"节点 {index} input {port_index} port 引用无效")
                source_node, source_port = reference
                if not 0 <= source_node < len(workflow) or not 0 <= source_port < len(workflow[source_node].get("output", [])):
                    raise HTTPException(status_code=422, detail=f"节点 {index} input {port_index} 引用了不存在的输出端口")
        for field in ("control_predecessors", "control_successors"):
            if not isinstance(node[field], list) or not all(isinstance(item, int) and 0 <= item < len(workflow) for item in node[field]):
                raise HTTPException(status_code=422, detail=f"节点 {index} 的 {field} 引用无效")


@app.get("/", response_class=FileResponse)
def index() -> Path:
    return STATIC_DIR / "index.html"


@app.get("/api/workflow")
def get_workflow() -> list[dict[str, Any]]:
    return read_workflow()


@app.put("/api/workflow")
def save_workflow(workflow: list[dict[str, Any]]) -> list[dict[str, Any]]:
    validate_workflow(workflow)
    DATA_FILE.write_text(json.dumps(workflow, ensure_ascii=False, indent=2), encoding="utf-8")
    return workflow


@app.post("/api/workflow/reset")
def reset_workflow() -> list[dict[str, Any]]:
    DATA_FILE.write_text(json.dumps(SEED_WORKFLOW, ensure_ascii=False, indent=2), encoding="utf-8")
    return SEED_WORKFLOW