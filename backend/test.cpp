#include <iostream>
#include <thread>
#include <chrono>

int main() {
    std::cout << "[MOCK ENGINE] Initiating simulated matching engine..." << std::endl;
    for (int i = 1; i <= 5; ++i) {
        std::cout << "[MOCK ENGINE] Processing Order Queue... cycle: " << i << std::endl;
        // std::this_thread::sleep_for(std::chrono::seconds(1));
    }
    std::cout << "[MOCK ENGINE] Finished. Exiting." << std::endl;
    return 0;
}