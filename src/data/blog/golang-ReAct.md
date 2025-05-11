---
title: 使用Go语言实现ReAct模型
publishDate: 2025-05-11T15:33:05.569Z
author: logeable
description: ReAct 框架是一个结合了推理和行动的通用范例，通过交错生成推理轨迹和任务特定操作，使 LLM (大型语言模型) 能够与外部工具交互来获取额外信息，从而给出更可靠和实际的回应。
tags: ["ReAct", "LLM", "GO", "Agent"]
---

## 核心架构设计

ReAct 模型的核心是思考(Reasoning)→ 行动(Action)→ 观察(Observation)的循环机制。使用 Go 语言实现这一架构时，我们可以设计以下核心组件:

```go
type ReactAgent struct {
    llm         LLMClient
    tools       []Tool
    context     *Context
    maxTurns    int
    prompter    Prompter
}
```

## 1. 主循环设计

Go 语言的强类型特性和简洁的并发模型非常适合实现 ReAct 的主循环：

```go
func (agent *ReactAgent) Process(userInput string) (string, error) {
    // 初始化上下文
    agent.context = NewContext(userInput)

    for i := 0; i < agent.maxTurns; i++ {
        // 1. 推理阶段 - 生成思考过程
        reasoning, err := agent.generateReasoning()
        if err != nil {
            return "", fmt.Errorf("推理生成失败: %w", err)
        }
        agent.context.AddReasoning(reasoning)

        // 2. 行动阶段 - 判断是否需要执行工具
        if agent.isActionRequired(reasoning) {
            actionName, actionParams := agent.extractAction(reasoning)
            agent.context.SetAction(actionName, actionParams)

            // 执行工具调用
            observation := agent.executeAction(actionName, actionParams)
            agent.context.AddObservation(observation)
        } else {
            // 3. 回答阶段 - 如不需要执行工具，提取最终答案
            finalAnswer := agent.extractFinalAnswer(reasoning)
            if finalAnswer != "" {
                return finalAnswer, nil
            }
        }
    }

    // 达到最大轮次仍未得到答案时的处理
    return agent.generateFallbackResponse(), nil
}
```

这个主循环设计遵循 ReAct 的核心理念：

- 迭代式推理：通过多轮交互不断完善思考
- 工具调用：基于推理结果决定是否调用外部工具
- 观察反馈：将工具执行结果纳入上下文，用于后续推理

## 2. 提示(Prompts)设计

有效的提示设计是 ReAct 成功的关键。我们可以创建一个专用的 Prompter 接口：

```go
type Prompter interface {
    GeneratePrompt(context *Context, tools []Tool) string
}

type DefaultPrompter struct {
    template string
}

func (p *DefaultPrompter) GeneratePrompt(context *Context, tools []Tool) string {
    // 实现提示模板的渲染逻辑
    tmpl, _ := template.New("prompt").Parse(p.template)
    var buf bytes.Buffer

    data := map[string]interface{}{
        "Tools":         tools,
        "UserInput":     context.UserInput,
        "HistoryExists": len(context.History) > 0,
        "History":       context.History,
    }

    tmpl.Execute(&buf, data)
    return buf.String()
}
```

ReAct 提示模板示例：

```
您是一个能够思考和行动的AI助手。请按照以下格式回答问题:

思考：请分析问题并思考解决方案。将复杂问题分解为子步骤并展示您的推理过程。

行动：[工具名称]([参数])
可用工具:
{{range .Tools}}
- {{.Name}}: {{.Description}}
  参数: {{.Parameters}}
{{end}}

观察：[工具执行的结果将显示在这里]

回答：[收集足够信息后] 提供最终完整答案。

用户问题: {{.UserInput}}

{{if .HistoryExists}}
历史交互:
{{range .History}}
思考: {{.Reasoning}}
{{if .ActionPerformed}}
行动: {{.ActionName}}({{.ActionParams}})
观察: {{.Observation}}
{{end}}
{{end}}
{{end}}

请开始您的思考:
```

这种提示设计：

1. 明确格式要求：清晰定义了"思考"、"行动"和"观察"的格式规范
2. 工具说明：动态列出可用工具及其参数要求
3. 历史记忆：包含之前所有交互记录，建立持续对话能力
4. 引导式生成：引导 LLM 按照 ReAct 范式进行输出

## 3. 工具集成设计

Go 语言的接口特性很适合设计灵活的工具系统：

```go
// Tool接口定义
type Tool interface {
    Name() string
    Description() string
    Parameters() string
    Execute(params string) string
}

// 搜索工具实现
type SearchTool struct {
    apiClient *http.Client
    apiKey    string
}

func (t *SearchTool) Name() string {
    return "search"
}

func (t *SearchTool) Description() string {
    return "在网络上搜索最新信息"
}

func (t *SearchTool) Parameters() string {
    return "搜索查询(string)"
}

func (t *SearchTool) Execute(params string) string {
    // 实现搜索API调用...
    return "搜索结果..."
}

// 计算器工具实现
type CalculatorTool struct{}

func (t *CalculatorTool) Name() string {
    return "calculator"
}

func (t *CalculatorTool) Description() string {
    return "执行数学计算"
}

func (t *CalculatorTool) Parameters() string {
    return "数学表达式(string)"
}

func (t *CalculatorTool) Execute(params string) string {
    // 实现数学表达式计算...
    return "计算结果..."
}
```

工具调用的辅助函数：

```go
func (agent *ReactAgent) executeAction(name string, params string) string {
    tool := agent.findTool(name)
    if tool == nil {
        return fmt.Sprintf("错误: 未找到工具 '%s'", name)
    }

    // 可添加超时控制和错误处理
    ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
    defer cancel()

    resultCh := make(chan string, 1)
    errCh := make(chan error, 1)

    go func() {
        defer func() {
            if r := recover(); r != nil {
                errCh <- fmt.Errorf("工具执行崩溃: %v", r)
            }
        }()

        result := tool.Execute(params)
        resultCh <- result
    }()

    select {
    case result := <-resultCh:
        return result
    case err := <-errCh:
        return fmt.Sprintf("工具执行错误: %v", err)
    case <-ctx.Done():
        return "工具执行超时"
    }
}
```

## 4. LLM 客户端集成

使用 Go 调用 LLM API 的接口设计：

```go
type LLMClient interface {
    Generate(prompt string) (string, error)
}

// OpenAI客户端实现
type OpenAIClient struct {
    client  *http.Client
    apiKey  string
    model   string
    baseURL string
}

func NewOpenAIClient(apiKey, model string) *OpenAIClient {
    return &OpenAIClient{
        client:  &http.Client{Timeout: 30 * time.Second},
        apiKey:  apiKey,
        model:   model,
        baseURL: "https://api.openai.com/v1/chat/completions",
    }
}

func (c *OpenAIClient) Generate(prompt string) (string, error) {
    // 构建请求体
    reqBody, _ := json.Marshal(map[string]interface{}{
        "model": c.model,
        "messages": []map[string]string{
            {"role": "user", "content": prompt},
        },
        "temperature": 0.7,
    })

    // 创建请求
    req, err := http.NewRequest("POST", c.baseURL, bytes.NewBuffer(reqBody))
    if err != nil {
        return "", err
    }

    // 设置请求头
    req.Header.Set("Content-Type", "application/json")
    req.Header.Set("Authorization", "Bearer "+c.apiKey)

    // 发送请求
    resp, err := c.client.Do(req)
    if err != nil {
        return "", err
    }
    defer resp.Body.Close()

    // 解析响应
    var result map[string]interface{}
    json.NewDecoder(resp.Body).Decode(&result)

    // 提取生成的文本
    choices, ok := result["choices"].([]interface{})
    if !ok || len(choices) == 0 {
        return "", fmt.Errorf("无效的API响应")
    }

    choice := choices[0].(map[string]interface{})
    message := choice["message"].(map[string]interface{})
    content := message["content"].(string)

    return content, nil
}
```

## 5. 上下文管理

设计上下文结构来维护交互历史：

```go
// 上下文结构
type Context struct {
    UserInput string
    History   []Exchange
}

// 交互记录结构
type Exchange struct {
    Reasoning      string
    ActionPerformed bool
    ActionName     string
    ActionParams   string
    Observation    string
}

func NewContext(userInput string) *Context {
    return &Context{
        UserInput: userInput,
        History:   []Exchange{},
    }
}

// 添加推理到上下文
func (c *Context) AddReasoning(reasoning string) {
    c.History = append(c.History, Exchange{
        Reasoning: reasoning,
    })
}

// 设置行动信息
func (c *Context) SetAction(name, params string) {
    lastIdx := len(c.History) - 1
    if lastIdx >= 0 {
        c.History[lastIdx].ActionPerformed = true
        c.History[lastIdx].ActionName = name
        c.History[lastIdx].ActionParams = params
    }
}

// 添加观察结果
func (c *Context) AddObservation(observation string) {
    lastIdx := len(c.History) - 1
    if lastIdx >= 0 {
        c.History[lastIdx].Observation = observation
    }
}

// 获取当前上下文的令牌估计数量
func (c *Context) EstimateTokens() int {
    // 简单估计：每4个字符约为1个token
    totalChars := len(c.UserInput)

    for _, exchange := range c.History {
        totalChars += len(exchange.Reasoning)
        totalChars += len(exchange.ActionName)
        totalChars += len(exchange.ActionParams)
        totalChars += len(exchange.Observation)
    }

    return totalChars / 4
}
```

## 6. 辅助解析函数

设计解析 LLM 输出的辅助函数：

```go
// 解析行动
func (agent *ReactAgent) extractAction(reasoning string) (name string, params string) {
    // 使用正则表达式提取行动名称和参数
    actionRegex := regexp.MustCompile(`行动: (\w+)\((.+?)\)`)
    matches := actionRegex.FindStringSubmatch(reasoning)

    if len(matches) >= 3 {
        name = matches[1]
        params = matches[2]
    }

    return
}

// 判断是否需要执行工具
func (agent *ReactAgent) isActionRequired(reasoning string) bool {
    return strings.Contains(reasoning, "行动:") && !strings.Contains(reasoning, "回答:")
}

// 提取最终答案
func (agent *ReactAgent) extractFinalAnswer(reasoning string) string {
    answerRegex := regexp.MustCompile(`回答: ([\s\S]+)`)
    matches := answerRegex.FindStringSubmatch(reasoning)

    if len(matches) >= 2 {
        return matches[1]
    }

    return ""
}
```

## 7. 完整系统集成

主程序示例：

```go
func main() {
    // 初始化LLM客户端
    llmClient := NewOpenAIClient(os.Getenv("OPENAI_API_KEY"), "gpt-4")

    // 初始化工具集
    tools := []Tool{
        &SearchTool{},
        &CalculatorTool{},
        &WeatherTool{},
        &DatabaseTool{},
    }

    // 创建默认提示器
    prompter := &DefaultPrompter{
        template: promptTemplate, // 上面定义的模板
    }

    // 创建ReAct代理
    agent := &ReactAgent{
        llm:      llmClient,
        tools:    tools,
        maxTurns: 5,
        prompter: prompter,
    }

    // 处理用户查询
    userInput := "中国和美国的时差是多少，并计算如果中国现在是下午3点，美国是几点？"
    result, err := agent.Process(userInput)
    if err != nil {
        fmt.Printf("错误: %v\n", err)
        return
    }

    fmt.Println("最终回答:", result)
}
```

## 8. Go 实现 ReAct 的优势与挑战

### 优势

1. 并发处理能力：使用 goroutine 和 channel 可实现工具并行执行和超时控制

   ```go
   // 并行执行多个工具示例
   func (agent *ReactAgent) executeParallelActions(actions []Action) []Observation {
       results := make([]Observation, len(actions))
       var wg sync.WaitGroup

       for i, action := range actions {
           wg.Add(1)
           go func(idx int, act Action) {
               defer wg.Done()
               tool := agent.findTool(act.Name)
               if tool == nil {
                   results[idx] = Observation{Error: "工具不存在"}
                   return
               }

               result := tool.Execute(act.Params)
               results[idx] = Observation{Result: result}
           }(i, action)
       }

       wg.Wait()
       return results
   }
   ```

2. 类型安全：Go 的静态类型系统有助于减少运行时错误

3. 部署便利性：编译为单一二进制文件，无需依赖，易于部署和分发

4. 性能优势：执行效率高，适合处理高并发请求

   ```go
   // 高性能HTTP服务器示例
   func setupServer(agent *ReactAgent) *http.Server {
       router := mux.NewRouter()

       router.HandleFunc("/react", func(w http.ResponseWriter, r *http.Request) {
           if r.Method != "POST" {
               http.Error(w, "仅支持POST请求", http.StatusMethodNotAllowed)
               return
           }

           var request struct {
               Query string `json:"query"`
           }

           if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
               http.Error(w, "无效的请求格式", http.StatusBadRequest)
               return
           }

           result, err := agent.Process(request.Query)
           if err != nil {
               http.Error(w, err.Error(), http.StatusInternalServerError)
               return
           }

           json.NewEncoder(w).Encode(map[string]string{"response": result})
       })

       return &http.Server{
           Addr:         ":8080",
           Handler:      router,
           ReadTimeout:  60 * time.Second,
           WriteTimeout: 60 * time.Second,
       }
   }
   ```

5. 良好的 AI 生态支持：langchaingo、go-openai 等库提供了可靠的基础设施

### 挑战

1. 提示工程复杂性：设计稳定可靠的提示模板需要反复调优

   ```go
   // 可能的解决方案：提示模板变体测试
   func benchmarkPromptTemplates(client LLMClient, testCases []string) map[string]TemplateMetrics {
       templates := map[string]string{
           "标准模板": standardTemplate,
           "详细模板": verboseTemplate,
           "简洁模板": conciseTemplate,
       }

       results := make(map[string]TemplateMetrics)

       for name, template := range templates {
           prompter := &DefaultPrompter{template: template}
           metrics := evaluateTemplate(client, prompter, testCases)
           results[name] = metrics
       }

       return results
   }
   ```

2. LLM 输出解析不稳定：不同 LLM 模型可能有不同的输出格式

   ```go
   // 可能的解决方案：多模式解析
   func (agent *ReactAgent) extractActionMultiMode(reasoning string) (name string, params string) {
       // 尝试多种格式匹配
       patterns := []string{
           `行动: (\w+)\((.+?)\)`,
           `行动：(\w+)\((.+?)\)`,
           `Action: (\w+)\((.+?)\)`,
           `使用工具 (\w+) 参数是 (.+)`,
       }

       for _, pattern := range patterns {
           regex := regexp.MustCompile(pattern)
           matches := regex.FindStringSubmatch(reasoning)
           if len(matches) >= 3 {
               return matches[1], matches[2]
           }
       }

       return "", ""
   }
   ```

3. 上下文管理：长对话可能导致上下文溢出

   ```go
   // 可能的解决方案：上下文压缩
   func (c *Context) Compress(maxTokens int) {
       currentTokens := c.EstimateTokens()
       if currentTokens <= maxTokens {
           return
       }

       // 计算需要压缩的令牌数
       excessTokens := currentTokens - maxTokens

       // 从最早的交互开始压缩
       for i := 0; i < len(c.History) && excessTokens > 0; i++ {
           // 保留行动和观察，但压缩推理部分
           exchange := &c.History[i]

           // 估算当前推理的令牌数
           reasoningTokens := len(exchange.Reasoning) / 4

           if reasoningTokens > 50 { // 只压缩较长的推理
               // 压缩为摘要
               exchange.Reasoning = fmt.Sprintf(
                   "推理摘要: 经考虑后%s使用工具%s并获得结果",
                   exchange.ActionPerformed ? "决定" : "没有",
                   exchange.ActionName,
               )

               // 更新节省的令牌数
               savedTokens := reasoningTokens - (len(exchange.Reasoning) / 4)
               excessTokens -= savedTokens
           }
       }
   }
   ```

4. 工具执行安全性：需要防止恶意指令和潜在安全风险

   ```go
   // 可能的解决方案：安全管理器
   type SafetyManager struct {
       blockedPatterns []string
       maxExecutionTime time.Duration
   }

   func (sm *SafetyManager) ValidateAction(name string, params string) error {
       // 检查工具名称是否在白名单中
       allowedTools := map[string]bool{
           "search": true,
           "calculator": true,
           "weather": true,
       }

       if !allowedTools[name] {
           return fmt.Errorf("未授权的工具: %s", name)
       }

       // 检查参数是否匹配阻止模式
       for _, pattern := range sm.blockedPatterns {
           if matched, _ := regexp.MatchString(pattern, params); matched {
               return fmt.Errorf("参数包含禁止内容")
           }
       }

       return nil
   }
   ```

5. API 限制和费用：需要处理配额限制和成本控制

   ```go
   // 可能的解决方案：令牌使用跟踪和限制
   type TokenUsageTracker struct {
       mu sync.Mutex
       usageByDay map[string]int
       limits map[string]int
   }

   func (t *TokenUsageTracker) TrackUsage(tokens int) (bool, error) {
       t.mu.Lock()
       defer t.mu.Unlock()

       today := time.Now().Format("2006-01-02")

       t.usageByDay[today] += tokens

       if limit, exists := t.limits[today]; exists && t.usageByDay[today] > limit {
           return false, fmt.Errorf("超出每日令牌限额")
       }

       return true, nil
   }
   ```

## 总结

Go 语言实现 ReAct 模型是一个理想的选择，其强类型、并发模型和性能特性非常适合构建可靠的 AI 代理系统。通过分离关注点（提示管理、工具执行、LLM 交互等），我们可以创建出一个灵活、可扩展且高性能的 ReAct 实现。

主要实施建议：

1. 使用接口抽象关键组件，便于替换和测试
2. 充分利用 Go 的并发特性处理工具执行
3. 实现健壮的错误处理和超时控制
4. 关注提示工程和输出解析的稳定性
5. 设计有效的上下文管理策略

通过这种架构，开发者可以构建出能够结合推理和行动能力的强大 AI 应用，同时充分利用 Go 语言的优势。
