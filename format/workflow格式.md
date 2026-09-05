workflow为一个数组
每个条目都是一条json
具体格式为:
```
{
    type:"type",
    name:"name",
    input:[
        {label:"AAA",source:"port",port:[id,port_index],type:"content"},
        {label:"BBB",source:"const",const:value,type:"list-content"},
    ],
    output:[
        {label:"BBB",source:"const",const:value,type:"message"},
    ],
    input_value:[
        value,
        value,
        ...
    ],
    arguments:{
        AA:BB,
    }
    control_predecessors:[],
    control_successors:[],
}
```
注意node与port均仅由index标识 
注意强类型

节点大部分参数由input配置,部分特殊参数由arguments配置

```json
{
    "type": "llm",
    "arguments":{}
    "input": [
        {"label": "prompt", "source": "const", "const": "总结以下内容","type":"content"},
        {"label": "model", "source": "const", "const": "deepseek-flash-v4","type":"content"},
        {"label": "think", "source": "const", "const": true,"type":"boolean"},
        {"label": "tools", "source": "const", "const": [],"type":"list-json"}
    ],
    "input_value": ["总结以下内容", true, []],
    "output": [
        {"label": "output", "source": "port", "port": null, "type":"content"}
    ]
}
```

所有量都可以选择const或port输入

一个node的构成:
index(列表下标)
type
name
input
output
input_value
arguments

control_successors与control_predecessors无特殊情况均要求length==1,foreach和router除外

input_value是运行时传递参数用的,每个类型的节点预填充会有不同的初始值,避免后续调用的时候出现值不存在的情况,要防御性判断,增加代码复杂度。同时预填充的另一大意义是,保证json结构规范,不出现取不到值的情况,执行器应当只修改 `input_value` 

保留Queue,变成task-event二级Queue or 树遍历?
树遍历,哦,可以用queue实现,但还是不要了 

说白了是queue和ui比较配套,但用树的话,ui复杂度会上升不少