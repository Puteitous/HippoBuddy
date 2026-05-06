package com.example.agent.memory;

import com.example.agent.web.server.DashboardServer;

public class SseTest {
    public static void main(String[] args) throws Exception {
        // 1. 启动服务器
        DashboardServer.start(9090);
        System.out.println("服务器已启动: http://localhost:9090/sse/memory-events");
        System.out.println("请在浏览器中打开上述地址");
        
        // 2. 模拟 3 次记忆写入
        Thread.sleep(2000);
        DashboardServer.broadcast("memory_saved", 
            "{\"id\":\"1\",\"type\":\"user_preference\",\"tags\":[\"react\",\"function-component\"]}");
        System.out.println("已推送第 1 条消息");
        
        Thread.sleep(3000);
        DashboardServer.broadcast("memory_saved", 
            "{\"id\":\"2\",\"type\":\"project_context\",\"tags\":[\"postgresql\",\"migration\"]}");
        System.out.println("已推送第 2 条消息");
        
        Thread.sleep(3000);
        DashboardServer.broadcast("memory_saved", 
            "{\"id\":\"3\",\"type\":\"feedback\",\"tags\":[\"reduce\",\"avoid\"]}");
        System.out.println("已推送第 3 条消息");
        
        System.out.println("3 条消息已推送，观察浏览器");
        Thread.sleep(10000);
        
        // 3. 关闭
        DashboardServer.stop();
        System.out.println("服务器已关闭");
    }
}
