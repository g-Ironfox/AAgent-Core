"""Compile a canvas workflow into an index-based linked-list structure."""

from __future__ import annotations

import os
import sys
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from pymongo import MongoClient
from workflow_contract import data_ports_for_node


class WorkflowParseError(ValueError):
    """Raised when a workflow cannot be loaded or compiled."""


def parse_workflow(workflow: dict[str, Any]) -> list[dict[str, Any]]:
    """Convert a canvas workflow to the index-based execution format.

    ``input_value`` is initialized with constant values and ``None`` slots for
    connected inputs so runtime code can update a stable, index-aligned array.
    """
    nodes = workflow["nodes"]
    connections = workflow["connections"]
    node_indexes = {node["id"]: index for index, node in enumerate(nodes)}
    linked_nodes: list[dict[str, Any]] = []
    for node in nodes:
        parsed_node = {
            key: value
            for key, value in node.items()
            if key not in {"x", "y", "dataInputPorts"}
        }
        input_ports, output_ports = _ordered_data_ports(node)
        input_port_indexes = {port_id: index for index, port_id in enumerate(input_ports)}
        output_port_indexes = {port_id: index for index, port_id in enumerate(output_ports)}
        inputs = _parse_inputs(node, input_ports)
        linked_nodes.append(
            {
                **parsed_node,
                "control_predecessors": [],
                "control_successors": [],
                "input": inputs,
                "output": [
                    {"label": port_id, "id": port_id, "type": "port", "port": None}
                    for port_id in output_ports
                ],
                "input_value": [item.get("const") for item in inputs],
            }
        )

    for connection in connections:
        from_id = connection["fromId"]
        to_id = connection["toId"]
        from_index = node_indexes[from_id]
        to_index = node_indexes[to_id]
        from_port = connection["fromPortId"]
        to_port = connection["toPortId"]
        connection_type = connection["type"]
        if connection_type == "control":
            _append_unique(linked_nodes[from_index]["control_successors"], to_index)
            _append_unique(linked_nodes[to_index]["control_predecessors"], from_index)
            continue
        else:
            linked_nodes[to_index]["input"][input_port_indexes[to_port]] = {
                "label": to_port,
                "id": to_port,
                "type": "port",
                "port": [from_index, output_port_indexes[from_port]],
            }
            linked_nodes[from_index]["output"][output_port_indexes[from_port]]["port"] = [
                to_index,
                input_port_indexes[to_port],
            ]

    return linked_nodes


def _parse_inputs(node: dict[str, Any], input_ports: list[str]) -> list[dict[str, Any]]:
    """Build input descriptors, including configured constant values."""
    constants = node.get("input", node.get("inputs", {}))
    if isinstance(constants, list):
        constants = {
            item.get("id"): item.get("const", item.get("value"))
            for item in constants
            if isinstance(item, dict) and item.get("id")
        }
    if not isinstance(constants, dict):
        constants = {}
    return [
        (
            {"label": port_id, "id": port_id, "type": "const", "const": constants[port_id]}
            if port_id in constants
            else {"label": port_id, "id": port_id, "type": "port", "port": None}
        )
        for port_id in input_ports
    ]


def _ordered_data_ports(node: dict[str, Any]) -> tuple[list[str], list[str]]:
    """Return deterministic port lists while preserving declared port order."""
    input_ports, output_ports = data_ports_for_node(node)
    declared_inputs = list(node.get("dataInputPorts", []))
    if node["type"] == "input":
        declared_outputs = [port["id"] for port in node.get("workflowPorts", [])]
    elif node["type"] == "output":
        declared_outputs = []
    elif node["type"] == "workflow":
        declared_inputs = [
            f"workflow:{port['name']}" for port in node.get("input_ports", [])
        ]
        declared_outputs = [
            f"workflow:{port['name']}" for port in node.get("output_ports", [])
        ]
    else:
        declared_outputs = []
    ordered_inputs = declared_inputs + sorted(input_ports - set(declared_inputs))
    ordered_outputs = declared_outputs + sorted(output_ports - set(declared_outputs))
    return ordered_inputs, ordered_outputs


def _append_unique(items: list[int], value: int) -> None:
    if value not in items:
        items.append(value)


def _read_workflow(workflow_id: str) -> dict[str, Any]:
    mongo_kwargs: dict[str, Any] = {
        "host": os.getenv("MONGO_HOST", "mongodb"),
        "port": int(os.getenv("MONGO_PORT", "27017")),
        "serverSelectionTimeoutMS": 5000,
    }
    if os.getenv("MONGO_USER"):
        mongo_kwargs.update(
            username=os.environ["MONGO_USER"],
            password=os.getenv("MONGO_PASS", ""),
            authSource="admin",
        )

    database_name = os.getenv("MONGO_DATABASE", "agent")
    collection_name = os.getenv("MONGO_WORKFLOW_COLLECTION", "workflows")
    with MongoClient(**mongo_kwargs) as client:
        try:
            query = {"_id": ObjectId(workflow_id)}
        except (InvalidId, TypeError):
            raise WorkflowParseError(f"workflow id invalid: {workflow_id}")
        workflow = client[database_name][collection_name].find_one(query, {"_id": False})
    if workflow is None:
        raise WorkflowParseError(f"workflow not found: {workflow_id}")
    return workflow


if __name__ =="__main__":
    workflow_id = sys.argv[1] if len(sys.argv) > 1 else ""
    result = parse_workflow(_read_workflow(workflow_id))
    for i in result:
        print(i)