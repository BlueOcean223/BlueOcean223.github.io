---
title: langchaingo
date: 2025-09-21 23:21:02
tags:
cover: https://blueocean223.github.io/auto-music/img/gopher2.png
category:
- 笔记
---

# 1. LangChain Go 简介

LangChain Go 是 LangChain 框架的 Go 语言实现版本，它为开发者提供了一套完整的工具链来构建基于大语言模型（LLM）的应用程序。LangChain Go 继承了 LangChain 的核心理念，旨在简化与各种 AI 模型的集成和交互过程。

## 主要特点

- **模块化设计**：提供了清晰的模块化架构，包括 llms、Prompts、Memory、Chains 等核心组件
- **多模型支持**：支持 OpenAI、Anthropic、Cohere、HuggingFace 等多种主流 AI 服务提供商
- **链式调用**：支持复杂的链式操作，可以将多个步骤组合成一个完整的工作流
- **内存管理**：提供多种内存管理策略，支持对话历史的持久化和管理
- **Go 语言优势**：充分利用 Go 语言的并发特性和性能优势

## 核心概念

- **LLM（Large Language Model）**：大语言模型的抽象接口
- **Prompt**：用于与模型交互的提示模板
- **Chain**：将多个组件串联起来的执行链
- **Memory**：用于存储和管理对话历史的组件
- **Agent**：能够使用工具并做出决策的智能代理

# 2. 安装和基本使用

## 安装

```bash
go mod init your-project
go get github.com/tmc/langchaingo
```

## 基本使用示例

### 2.1 调用 OpenAI 模型

```go
package main

import (
    "context"
    "fmt"
    "log"
    "os"

    "github.com/tmc/langchaingo/llms"
    "github.com/tmc/langchaingo/llms/openai"
)

func main() {
    // 设置 API Key
    os.Setenv("OPENAI_API_KEY", "your-api-key")
    
    // 创建 OpenAI LLM 实例
    llm, err := openai.New()
    if err != nil {
        log.Fatal(err)
    }
    
    // 调用模型
    ctx := context.Background()
    completion, err := llm.Call(ctx, "什么是 Go 语言？")
    if err != nil {
        log.Fatal(err)
    }
    
    fmt.Println(completion)
}
```

### 2.2 配置不同的模型

#### OpenAI 配置

```go
import "github.com/tmc/langchaingo/llms/openai"

// 基本配置
llm, err := openai.New()

// 自定义配置
llm, err := openai.New(
    openai.WithModel("gpt-4"),
    openai.WithTemperature(0.7),
    openai.WithMaxTokens(1000),
)
```

#### Anthropic Claude 配置

```go
import "github.com/tmc/langchaingo/llms/anthropic"

// 设置环境变量
os.Setenv("ANTHROPIC_API_KEY", "your-anthropic-key")

llm, err := anthropic.New(
    anthropic.WithModel("claude-3-sonnet-20240229"),
    anthropic.WithTemperature(0.5),
)
```

#### Cohere 配置

```go
import "github.com/tmc/langchaingo/llms/cohere"

os.Setenv("COHERE_API_KEY", "your-cohere-key")

llm, err := cohere.New(
    cohere.WithModel("command"),
    cohere.WithTemperature(0.8),
)
```

#### 本地模型（Ollama）配置

```go
import "github.com/tmc/langchaingo/llms/ollama"

llm, err := ollama.New(
    ollama.WithServerURL("http://localhost:11434"),
    ollama.WithModel("llama2"),
)
```

#### 国产大模型配置

##### DeepSeek 配置

DeepSeek 提供了兼容 OpenAI API 的接口，可以通过 OpenAI 包来配置：

```go
import "github.com/tmc/langchaingo/llms/openai"

// DeepSeek API 配置
llm, err := openai.New(
    openai.WithModel("deepseek-chat"),
    openai.WithBaseURL("https://api.deepseek.com/v1"),
    openai.WithToken("your-deepseek-api-key"),
    openai.WithTemperature(0.7),
    openai.WithMaxTokens(2000),
)

// 也可以使用 DeepSeek Coder 模型
llmCoder, err := openai.New(
    openai.WithModel("deepseek-coder"),
    openai.WithBaseURL("https://api.deepseek.com/v1"),
    openai.WithToken("your-deepseek-api-key"),
)
```

##### 智谱 AI (GLM) 配置

```go
// 智谱 AI GLM-4 配置
llm, err := openai.New(
    openai.WithModel("glm-4"),
    openai.WithBaseURL("https://open.bigmodel.cn/api/paas/v4"),
    openai.WithToken("your-zhipu-api-key"),
    openai.WithTemperature(0.8),
)

// GLM-4V 多模态模型
llmVision, err := openai.New(
    openai.WithModel("glm-4v"),
    openai.WithBaseURL("https://open.bigmodel.cn/api/paas/v4"),
    openai.WithToken("your-zhipu-api-key"),
)
```

##### 阿里通义千问配置

```go
// 通义千问配置
llm, err := openai.New(
    openai.WithModel("qwen-turbo"),
    openai.WithBaseURL("https://dashscope.aliyuncs.com/compatible-mode/v1"),
    openai.WithToken("your-dashscope-api-key"),
    openai.WithTemperature(0.7),
)

// 通义千问 Plus
llmPlus, err := openai.New(
    openai.WithModel("qwen-plus"),
    openai.WithBaseURL("https://dashscope.aliyuncs.com/compatible-mode/v1"),
    openai.WithToken("your-dashscope-api-key"),
)
```

##### 月之暗面 Kimi 配置

```go
// Kimi 配置
llm, err := openai.New(
    openai.WithModel("moonshot-v1-8k"),
    openai.WithBaseURL("https://api.moonshot.cn/v1"),
    openai.WithToken("your-moonshot-api-key"),
    openai.WithTemperature(0.3),
)

// Kimi 长上下文版本
llmLong, err := openai.New(
    openai.WithModel("moonshot-v1-128k"),
    openai.WithBaseURL("https://api.moonshot.cn/v1"),
    openai.WithToken("your-moonshot-api-key"),
)
```

##### 零一万物 Yi 配置

```go
// Yi 大模型配置
llm, err := openai.New(
    openai.WithModel("yi-34b-chat-0205"),
    openai.WithBaseURL("https://api.lingyiwanwu.com/v1"),
    openai.WithToken("your-yi-api-key"),
    openai.WithTemperature(0.7),
    openai.WithMaxTokens(1500),
)
```

#### 多模型管理和切换

在实际应用中，你可能需要根据不同的场景使用不同的模型。以下是一个多模型管理的示例：

```go
type ModelManager struct {
    models map[string]llms.Model
}

func NewModelManager() *ModelManager {
    return &ModelManager{
        models: make(map[string]llms.Model),
    }
}

func (mm *ModelManager) InitModels() error {
    // 初始化 OpenAI
    openaiLLM, err := openai.New(
        openai.WithModel("gpt-4"),
        openai.WithToken(os.Getenv("OPENAI_API_KEY")),
    )
    if err != nil {
        return err
    }
    mm.models["openai"] = openaiLLM

    // 初始化 DeepSeek
    deepseekLLM, err := openai.New(
        openai.WithModel("deepseek-chat"),
        openai.WithBaseURL("https://api.deepseek.com/v1"),
        openai.WithToken(os.Getenv("DEEPSEEK_API_KEY")),
    )
    if err != nil {
        return err
    }
    mm.models["deepseek"] = deepseekLLM

    // 初始化智谱 AI
    zhipuLLM, err := openai.New(
        openai.WithModel("glm-4"),
        openai.WithBaseURL("https://open.bigmodel.cn/api/paas/v4"),
        openai.WithToken(os.Getenv("ZHIPU_API_KEY")),
    )
    if err != nil {
        return err
    }
    mm.models["zhipu"] = zhipuLLM

    return nil
}

func (mm *ModelManager) GetModel(name string) (llms.Model, error) {
    model, exists := mm.models[name]
    if !exists {
        return nil, fmt.Errorf("model %s not found", name)
    }
    return model, nil
}

// 使用示例
func main() {
    manager := NewModelManager()
    err := manager.InitModels()
    if err != nil {
        log.Fatal(err)
    }

    // 根据需要选择不同的模型
    model, err := manager.GetModel("deepseek")
    if err != nil {
        log.Fatal(err)
    }

    result, err := model.Call(context.Background(), "你好，请介绍一下自己")
    if err != nil {
        log.Fatal(err)
    }
    
    fmt.Println(result)
}
```

#### 模型配置最佳实践

```go
// 配置文件示例 (config.yaml)
type ModelConfig struct {
    Name        string  `yaml:"name"`
    Model       string  `yaml:"model"`
    BaseURL     string  `yaml:"base_url"`
    APIKey      string  `yaml:"api_key"`
    Temperature float64 `yaml:"temperature"`
    MaxTokens   int     `yaml:"max_tokens"`
    Timeout     int     `yaml:"timeout"`
}

type Config struct {
    Models []ModelConfig `yaml:"models"`
}

// 从配置文件加载模型
func LoadModelsFromConfig(configPath string) (map[string]llms.Model, error) {
    data, err := ioutil.ReadFile(configPath)
    if err != nil {
        return nil, err
    }

    var config Config
    err = yaml.Unmarshal(data, &config)
    if err != nil {
        return nil, err
    }

    models := make(map[string]llms.Model)
    
    for _, modelConfig := range config.Models {
        var llm llms.Model
        var err error

        // 根据配置创建模型实例
        if modelConfig.BaseURL != "" {
            // 使用自定义 BaseURL 的模型（如国产大模型）
            llm, err = openai.New(
                openai.WithModel(modelConfig.Model),
                openai.WithBaseURL(modelConfig.BaseURL),
                openai.WithToken(modelConfig.APIKey),
                openai.WithTemperature(modelConfig.Temperature),
                openai.WithMaxTokens(modelConfig.MaxTokens),
            )
        } else {
            // 标准 OpenAI 模型
            llm, err = openai.New(
                openai.WithModel(modelConfig.Model),
                openai.WithToken(modelConfig.APIKey),
                openai.WithTemperature(modelConfig.Temperature),
                openai.WithMaxTokens(modelConfig.MaxTokens),
            )
        }

        if err != nil {
            return nil, fmt.Errorf("failed to create model %s: %w", modelConfig.Name, err)
        }

        models[modelConfig.Name] = llm
    }

    return models, nil
}
```

配置文件示例 (config.yaml)：

```yaml
models:
  - name: "openai"
    model: "gpt-4"
    api_key: "${OPENAI_API_KEY}"
    temperature: 0.7
    max_tokens: 2000
    timeout: 30

  - name: "deepseek"
    model: "deepseek-chat"
    base_url: "https://api.deepseek.com/v1"
    api_key: "${DEEPSEEK_API_KEY}"
    temperature: 0.7
    max_tokens: 2000

  - name: "zhipu"
    model: "glm-4"
    base_url: "https://open.bigmodel.cn/api/paas/v4"
    api_key: "${ZHIPU_API_KEY}"
    temperature: 0.8
    max_tokens: 1500

  - name: "kimi"
    model: "moonshot-v1-8k"
    base_url: "https://api.moonshot.cn/v1"
    api_key: "${MOONSHOT_API_KEY}"
    temperature: 0.3
    max_tokens: 1000
```

# 3. 核心子包详解

## 3.1 Prompts 包

Prompts 包提供了强大的提示模板功能，支持动态参数替换和复杂的提示构建。

```go
import "github.com/tmc/langchaingo/prompts"

// 创建简单提示模板
template := prompts.NewPromptTemplate(
    "请回答关于 {{.topic}} 的问题：{{.question}}",
    []string{"topic", "question"},
)

// 格式化提示
prompt, err := template.Format(map[string]any{
    "topic":    "Go 语言",
    "question": "什么是 goroutine？",
})

// 聊天提示模板
chatTemplate := prompts.NewChatPromptTemplate([]prompts.MessageFormatter{
    prompts.NewSystemMessagePromptTemplate("你是一个专业的 Go 语言专家", nil),
    prompts.NewHumanMessagePromptTemplate("请解释：{{.concept}}", []string{"concept"}),
})
```

## 3.2 Memory 包

Memory 包提供了多种内存管理策略，用于维护对话历史和上下文。

```go
import (
    "github.com/tmc/langchaingo/memory"
    "github.com/tmc/langchaingo/schema"
)

// 缓冲区内存 - 保存最近的对话
bufferMemory := memory.NewConversationBuffer()

// 窗口内存 - 只保留最近 N 条消息
windowMemory := memory.NewConversationWindowBuffer(5)

// 摘要内存 - 自动总结历史对话
summaryMemory := memory.NewConversationSummaryBuffer(llm, 1000)

// 使用内存
bufferMemory.SaveContext(
    context.Background(),
    map[string]any{"input": "你好"},
    map[string]any{"output": "你好！有什么可以帮助你的吗？"},
)

// 获取内存中的消息
messages, err := bufferMemory.ChatHistory.Messages(context.Background())
```

## 3.3 Chains 包

Chains 包允许将多个组件串联起来，创建复杂的处理流程。

```go
import "github.com/tmc/langchaingo/chains"

// LLM Chain - 基本的 LLM 调用链
llmChain := chains.NewLLMChain(llm, template)

// 对话链 - 带内存的对话链
conversationChain := chains.NewConversation(llm, bufferMemory)

// 顺序链 - 按顺序执行多个链
sequentialChain := chains.NewSequentialChain([]chains.Chain{
    chain1,
    chain2,
    chain3,
})

// 执行链
result, err := llmChain.Call(context.Background(), map[string]any{
    "topic":    "微服务",
    "question": "什么是服务发现？",
})
```

### 3.4 Agents 包

Agents 包提供了智能代理功能，能够使用工具并做出决策。

```go
import (
    "github.com/tmc/langchaingo/agents"
    "github.com/tmc/langchaingo/tools"
)

// 创建工具
calculator := tools.Calculator{}
webSearch := tools.SerpAPI{APIKey: "your-serpapi-key"}

// 创建代理
agent := agents.NewZeroShotReactDescription(
    llm,
    []tools.Tool{calculator, webSearch},
    agents.WithMaxIterations(5),
)

// 执行代理任务
result, err := agent.Call(context.Background(), map[string]any{
    "input": "2023年世界杯冠军是哪个国家？请计算该国家人口的平方根。",
})
```

# 4. 高级特性和最佳实践

## 4.1 流式响应

```go
// 流式调用
stream, err := llm.GenerateContent(
    context.Background(),
    []llms.MessageContent{
        llms.TextParts(llms.ChatMessageTypeHuman, "写一首关于 Go 语言的诗"),
    },
    llms.WithStreamingFunc(func(ctx context.Context, chunk []byte) error {
        fmt.Print(string(chunk))
        return nil
    }),
)
```

## 4.2 错误处理和重试

```go
import "github.com/tmc/langchaingo/llms"

// 配置重试策略
llm, err := openai.New(
    openai.WithRetryPolicy(llms.RetryPolicy{
        MaxRetries: 3,
        Backoff:    llms.ExponentialBackoff,
    }),
)

// 自定义错误处理
result, err := llm.Call(ctx, prompt)
if err != nil {
    switch {
    case errors.Is(err, llms.ErrRateLimited):
        // 处理速率限制
        time.Sleep(time.Minute)
        return retry()
    case errors.Is(err, llms.ErrInvalidRequest):
        // 处理无效请求
        return handleInvalidRequest(err)
    default:
        return err
    }
}
```

## 4.3 自定义工具

```go
import "github.com/tmc/langchaingo/tools"

// 实现自定义工具
type WeatherTool struct{}

func (w WeatherTool) Name() string {
    return "weather"
}

func (w WeatherTool) Description() string {
    return "获取指定城市的天气信息。输入：城市名称"
}

func (w WeatherTool) Call(ctx context.Context, input string) (string, error) {
    // 实现天气查询逻辑
    return fmt.Sprintf("%s 的天气：晴朗，25°C", input), nil
}
```

## 4.4 文档处理

```go
import (
    "github.com/tmc/langchaingo/documentloaders"
    "github.com/tmc/langchaingo/textsplitter"
    "github.com/tmc/langchaingo/vectorstores"
)

// 加载文档
loader := documentloaders.NewText("document.txt")
docs, err := loader.Load(context.Background())

// 分割文档
splitter := textsplitter.NewRecursiveCharacter()
chunks, err := splitter.SplitDocuments(docs)

// 创建向量存储
vectorStore := vectorstores.NewInMemory(embeddings)
err = vectorStore.AddDocuments(context.Background(), chunks)
```

## 4.5 配置管理

```go
// 使用配置文件
type Config struct {
    OpenAI struct {
        APIKey      string  `yaml:"api_key"`
        Model       string  `yaml:"model"`
        Temperature float64 `yaml:"temperature"`
    } `yaml:"openai"`
    
    Memory struct {
        Type       string `yaml:"type"`
        WindowSize int    `yaml:"window_size"`
    } `yaml:"memory"`
}

// 环境变量配置
func loadConfig() *Config {
    config := &Config{}
    
    // 从环境变量读取
    config.OpenAI.APIKey = os.Getenv("OPENAI_API_KEY")
    config.OpenAI.Model = getEnvOrDefault("OPENAI_MODEL", "gpt-3.5-turbo")
    
    return config
}
```

# 5. 实际应用场景

## 5.1 智能客服系统

```go
type CustomerService struct {
    llm    llms.Model
    memory memory.ConversationBuffer
    chain  chains.Chain
}

func (cs *CustomerService) HandleQuery(ctx context.Context, userInput string) (string, error) {
    // 使用带内存的对话链处理用户查询
    result, err := cs.chain.Call(ctx, map[string]any{
        "input": userInput,
    })
    
    if err != nil {
        return "", err
    }
    
    return result["output"].(string), nil
}
```

## 5.2 代码生成助手

```go
func generateCode(ctx context.Context, requirement string) (string, error) {
    template := prompts.NewPromptTemplate(`
作为一个专业的 Go 语言开发者，请根据以下需求生成代码：

需求：{{.requirement}}

请提供：
1. 完整的 Go 代码实现
2. 必要的注释
3. 使用示例

代码：`, []string{"requirement"})

    chain := chains.NewLLMChain(llm, template)
    
    result, err := chain.Call(ctx, map[string]any{
        "requirement": requirement,
    })
    
    return result["text"].(string), err
}
```

## 5.3 文档问答系统

```go
type DocumentQA struct {
    vectorStore vectorstores.VectorStore
    llm         llms.Model
    retriever   vectorstores.Retriever
}

func (dqa *DocumentQA) Answer(ctx context.Context, question string) (string, error) {
    // 检索相关文档
    docs, err := dqa.retriever.GetRelevantDocuments(ctx, question)
    if err != nil {
        return "", err
    }
    
    // 构建上下文
    context := ""
    for _, doc := range docs {
        context += doc.PageContent + "\n"
    }
    
    // 生成答案
    prompt := fmt.Sprintf(`
基于以下上下文回答问题：

上下文：
%s

问题：%s

答案：`, context, question)
    
    return dqa.llm.Call(ctx, prompt)
}
```

# 6. 性能优化建议

## 6.1 连接池管理

```go
// 使用连接池减少连接开销
llm, err := openai.New(
    openai.WithHTTPClient(&http.Client{
        Transport: &http.Transport{
            MaxIdleConns:        100,
            MaxIdleConnsPerHost: 10,
            IdleConnTimeout:     90 * time.Second,
        },
        Timeout: 30 * time.Second,
    }),
)
```

## 6.2 缓存策略

```go
import "github.com/patrickmn/go-cache"

type CachedLLM struct {
    llm   llms.Model
    cache *cache.Cache
}

func (c *CachedLLM) Call(ctx context.Context, prompt string) (string, error) {
    // 检查缓存
    if cached, found := c.cache.Get(prompt); found {
        return cached.(string), nil
    }
    
    // 调用 LLM
    result, err := c.llm.Call(ctx, prompt)
    if err != nil {
        return "", err
    }
    
    // 缓存结果
    c.cache.Set(prompt, result, cache.DefaultExpiration)
    return result, nil
}
```

## 6.3 并发处理

```go
func processBatch(ctx context.Context, prompts []string) ([]string, error) {
    results := make([]string, len(prompts))
    errors := make([]error, len(prompts))
    
    var wg sync.WaitGroup
    semaphore := make(chan struct{}, 10) // 限制并发数
    
    for i, prompt := range prompts {
        wg.Add(1)
        go func(index int, p string) {
            defer wg.Done()
            
            semaphore <- struct{}{} // 获取信号量
            defer func() { <-semaphore }() // 释放信号量
            
            result, err := llm.Call(ctx, p)
            results[index] = result
            errors[index] = err
        }(i, prompt)
    }
    
    wg.Wait()
    
    // 检查错误
    for _, err := range errors {
        if err != nil {
            return nil, err
        }
    }
    
    return results, nil
}
```

# 7. 总结

LangChain Go 为 Go 开发者提供了一个强大而灵活的框架来构建基于大语言模型的应用程序。通过其模块化的设计，开发者可以：

1. **快速集成**：轻松集成多种主流 AI 服务提供商
2. **灵活组合**：通过 Chains 和 Agents 构建复杂的工作流
3. **内存管理**：有效管理对话历史和上下文
4. **工具扩展**：方便地添加自定义工具和功能

## 关键优势

- **性能优异**：充分利用 Go 语言的并发特性
- **类型安全**：编译时类型检查，减少运行时错误
- **易于部署**：单一二进制文件，部署简单
- **生态丰富**：与 Go 生态系统无缝集成

## 最佳实践总结

1. **合理使用内存管理**：根据应用场景选择合适的内存策略
2. **错误处理**：实现完善的错误处理和重试机制
3. **性能优化**：使用连接池、缓存和并发控制
4. **安全考虑**：妥善管理 API 密钥和敏感信息
5. **监控日志**：添加适当的日志和监控

LangChain Go 正在快速发展，随着 AI 技术的不断进步，它将为 Go 开发者提供更多强大的功能和可能性。建议开发者持续关注其更新，并在实际项目中积极实践和探索。
