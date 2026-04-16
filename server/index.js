const express = require('express');
const os = require('os');

const app = express();
app.use(express.json());

const SERVER_ID = process.env.SERVER_ID || `server-${os.hostname()}`;
const PORT = parseInt(process.env.PORT || '3000', 10);
const startTime = Date.now();
let activeConnections = 0;

/* ΓöÇΓöÇ Middleware: track active connections ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */
app.use((req, res, next) => {
    activeConnections++;
    res.on('finish', () => { activeConnections--; });
    next();
});

/* ΓöÇΓöÇ Helper: wrap response with timing + server id ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */
function respond(res, result) {
    res.json({
        result,
        server_id: SERVER_ID,
        timestamp: Date.now()
    });
}

/* ================================================================
   GET /health  ΓÇö  Health check endpoint
   ================================================================ */
app.get('/health', (req, res) => {
    const cpus = os.cpus();
    const cpuUsage = cpus.reduce((acc, cpu) => {
        const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
        const idle = cpu.times.idle;
        return acc + ((total - idle) / total) * 100;
    }, 0) / cpus.length;

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memoryUsage = ((totalMem - freeMem) / totalMem) * 100;

    res.json({
        status: 'healthy',
        server_id: SERVER_ID,
        cpu: Math.round(cpuUsage * 100) / 100,
        memory: Math.round(memoryUsage * 100) / 100,
        active_connections: activeConnections,
        uptime: Math.floor((Date.now() - startTime) / 1000),
        timestamp: Date.now()
    });
});

/* ================================================================
   GET /data  ΓÇö  Simple cacheable JSON response (same every time)
   ================================================================ */
const STATIC_DATA = {
    datasets: [
        { id: 1, name: 'MNIST', samples: 60000, features: 784, description: 'Handwritten digits' },
        { id: 2, name: 'CIFAR-10', samples: 50000, features: 3072, description: 'Color images 10 classes' },
        { id: 3, name: 'Iris', samples: 150, features: 4, description: 'Flower classification' },
        { id: 4, name: 'Boston Housing', samples: 506, features: 13, description: 'House price prediction' },
        { id: 5, name: 'Wine Quality', samples: 4898, features: 11, description: 'Wine rating prediction' }
    ],
    total: 5,
    cacheable: true
};

app.get('/data', (req, res) => {
    respond(res, STATIC_DATA);
});

/* ================================================================
   GET /cpu  ΓÇö  CPU-intensive workload
   Matrix multiplication + prime factorization + Fibonacci
   ================================================================ */
function matrixMultiply(size) {
    const A = [];
    const B = [];
    const C = [];
    for (let i = 0; i < size; i++) {
        A[i] = [];
        B[i] = [];
        C[i] = [];
        for (let j = 0; j < size; j++) {
            A[i][j] = Math.random() * 10;
            B[i][j] = Math.random() * 10;
            C[i][j] = 0;
        }
    }
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            for (let k = 0; k < size; k++) {
                C[i][j] += A[i][k] * B[k][j];
            }
        }
    }
    return C[0][0]; // Return top-left element as proof of work
}

function primeFactors(n) {
    const factors = [];
    let d = 2;
    while (n > 1) {
        while (n % d === 0) {
            factors.push(d);
            n /= d;
        }
        d++;
        if (d * d > n && n > 1) {
            factors.push(n);
            break;
        }
    }
    return factors;
}

function fibonacci(n) {
    if (n <= 1) return n;
    return fibonacci(n - 1) + fibonacci(n - 2);
}

app.get('/cpu', (req, res) => {
    const start = Date.now();

    const matrixResult = matrixMultiply(50);
    const factors = primeFactors(1234567890);
    const fib = fibonacci(30);

    const processingTime = Date.now() - start;
    respond(res, {
        workload: 'cpu',
        matrix_top_left: matrixResult,
        prime_factors_of_1234567890: factors,
        fibonacci_35: fib,
        processing_time_ms: processingTime
    });
});

/* ================================================================
   GET /ml  ΓÇö  ML simulation: gradient descent linear regression
   Trains a linear model on synthetic data from scratch
   ================================================================ */
function gradientDescent(numSamples, learningRate, epochs) {
    // Generate synthetic data: y = 3x + 7 + noise
    const X = [];
    const y = [];
    for (let i = 0; i < numSamples; i++) {
        const xi = Math.random() * 10;
        X.push(xi);
        y.push(3 * xi + 7 + (Math.random() - 0.5) * 2);
    }

    // Initialize weights
    let w = Math.random();
    let b = Math.random();
    const lossHistory = [];

    // Train
    for (let epoch = 0; epoch < epochs; epoch++) {
        let dw = 0;
        let db = 0;
        let totalLoss = 0;

        for (let i = 0; i < numSamples; i++) {
            const prediction = w * X[i] + b;
            const error = prediction - y[i];
            dw += (2 / numSamples) * error * X[i];
            db += (2 / numSamples) * error;
            totalLoss += error * error;
        }

        w -= learningRate * dw;
        b -= learningRate * db;

        if (epoch % 100 === 0) {
            lossHistory.push({
                epoch,
                loss: totalLoss / numSamples
            });
        }
    }

    return { weight: w, bias: b, loss_history: lossHistory, final_loss: lossHistory[lossHistory.length - 1]?.loss };
}

app.get('/ml', (req, res) => {
    const start = Date.now();

    const model = gradientDescent(200, 0.01, 500);

    const processingTime = Date.now() - start;
    respond(res, {
        workload: 'ml_gradient_descent',
        target: 'y = 3x + 7',
        learned_weight: Math.round(model.weight * 1000) / 1000,
        learned_bias: Math.round(model.bias * 1000) / 1000,
        final_loss: Math.round(model.final_loss * 1000) / 1000,
        epochs_trained: 1000,
        samples: 500,
        loss_history_sample: model.loss_history.slice(0, 5),
        processing_time_ms: processingTime
    });
});

/* ================================================================
   GET /image  ΓÇö  Image processing simulation
   Generate pixel array, apply Gaussian blur + edge detection
   ================================================================ */
function generateImage(width, height) {
    const pixels = new Float64Array(width * height);
    for (let i = 0; i < pixels.length; i++) {
        pixels[i] = Math.random() * 255;
    }
    return pixels;
}

function gaussianBlur(pixels, width, height) {
    const kernel = [
        [1, 2, 1],
        [2, 4, 2],
        [1, 2, 1]
    ];
    const kernelSum = 16;
    const output = new Float64Array(width * height);

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            let sum = 0;
            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    sum += pixels[(y + ky) * width + (x + kx)] * kernel[ky + 1][kx + 1];
                }
            }
            output[y * width + x] = sum / kernelSum;
        }
    }
    return output;
}

function sobelEdgeDetect(pixels, width, height) {
    const Gx = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
    const Gy = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]];
    const output = new Float64Array(width * height);
    let maxGradient = 0;

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            let gx = 0;
            let gy = 0;
            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    const pixel = pixels[(y + ky) * width + (x + kx)];
                    gx += pixel * Gx[ky + 1][kx + 1];
                    gy += pixel * Gy[ky + 1][kx + 1];
                }
            }
            const magnitude = Math.sqrt(gx * gx + gy * gy);
            output[y * width + x] = magnitude;
            if (magnitude > maxGradient) maxGradient = magnitude;
        }
    }
    return { edges: output, max_gradient: maxGradient };
}

app.get('/image', (req, res) => {
    const start = Date.now();
    const width = 256;
    const height = 256;

    const raw = generateImage(width, height);
    const blurred = gaussianBlur(raw, width, height);
    const { edges, max_gradient } = sobelEdgeDetect(blurred, width, height);

    // Compute stats
    let edgeSum = 0;
    let edgeCount = 0;
    for (let i = 0; i < edges.length; i++) {
        if (edges[i] > max_gradient * 0.1) {
            edgeCount++;
            edgeSum += edges[i];
        }
    }

    const processingTime = Date.now() - start;
    respond(res, {
        workload: 'image_processing',
        image_size: `${width}x${height}`,
        total_pixels: width * height,
        operations: ['gaussian_blur_3x3', 'sobel_edge_detection'],
        edge_pixels_detected: edgeCount,
        avg_edge_strength: edgeCount > 0 ? Math.round(edgeSum / edgeCount * 100) / 100 : 0,
        max_gradient: Math.round(max_gradient * 100) / 100,
        processing_time_ms: processingTime
    });
});

/* ================================================================
   GET /api/train  ΓÇö  Extended ML training (heavier workload)
   Multiple epochs of multi-feature regression
   ================================================================ */
app.get('/api/train', (req, res) => {
    const start = Date.now();

    // Multi-feature dataset: y = 2*x1 + 3*x2 - 1.5*x3 + 10
    const numSamples = 500;
    const numFeatures = 3;
    const trueWeights = [2, 3, -1.5];
    const trueBias = 10;

    const X = [];
    const y = [];
    for (let i = 0; i < numSamples; i++) {
        const row = [];
        let target = trueBias;
        for (let f = 0; f < numFeatures; f++) {
            const val = Math.random() * 10 - 5;
            row.push(val);
            target += trueWeights[f] * val;
        }
        X.push(row);
        y.push(target + (Math.random() - 0.5) * 3);
    }

    // Train with gradient descent
    const weights = new Array(numFeatures).fill(0).map(() => Math.random() - 0.5);
    let bias = 0;
    const lr = 0.001;
    const epochs = 800;
    const lossHistory = [];

    for (let epoch = 0; epoch < epochs; epoch++) {
        const gradW = new Array(numFeatures).fill(0);
        let gradB = 0;
        let totalLoss = 0;

        for (let i = 0; i < numSamples; i++) {
            let pred = bias;
            for (let f = 0; f < numFeatures; f++) pred += weights[f] * X[i][f];
            const error = pred - y[i];
            for (let f = 0; f < numFeatures; f++) gradW[f] += (2 / numSamples) * error * X[i][f];
            gradB += (2 / numSamples) * error;
            totalLoss += error * error;
        }

        for (let f = 0; f < numFeatures; f++) weights[f] -= lr * gradW[f];
        bias -= lr * gradB;

        if (epoch % 200 === 0) {
            lossHistory.push({ epoch, loss: Math.round((totalLoss / numSamples) * 1000) / 1000 });
        }
    }

    const processingTime = Date.now() - start;
    respond(res, {
        workload: 'multi_feature_regression',
        target: 'y = 2*x1 + 3*x2 - 1.5*x3 + 10',
        learned_weights: weights.map(w => Math.round(w * 1000) / 1000),
        learned_bias: Math.round(bias * 1000) / 1000,
        final_loss: lossHistory[lossHistory.length - 1]?.loss,
        epochs: epochs,
        samples: numSamples,
        features: numFeatures,
        loss_history: lossHistory,
        processing_time_ms: processingTime
    });
});

/* ================================================================
   GET /api/predict  ΓÇö  Run inference on a trained model
   ================================================================ */
app.get('/api/predict', (req, res) => {
    const start = Date.now();

    // Simulate inference: generate batch of predictions
    const batchSize = 100;
    const weights = [2.01, 2.98, -1.49];
    const bias = 9.95;
    const predictions = [];

    for (let i = 0; i < batchSize; i++) {
        const features = [
            Math.random() * 10 - 5,
            Math.random() * 10 - 5,
            Math.random() * 10 - 5
        ];
        let pred = bias;
        for (let f = 0; f < features.length; f++) pred += weights[f] * features[f];
        predictions.push({
            input: features.map(f => Math.round(f * 100) / 100),
            prediction: Math.round(pred * 100) / 100
        });
    }

    const processingTime = Date.now() - start;
    respond(res, {
        workload: 'batch_inference',
        model_weights: weights,
        model_bias: bias,
        batch_size: batchSize,
        predictions_sample: predictions.slice(0, 5),
        processing_time_ms: processingTime
    });
});

/* ================================================================
   GET /api/datasets  ΓÇö  List available training datasets
   ================================================================ */
app.get('/api/datasets', (req, res) => {
    respond(res, STATIC_DATA);
});

/* ================================================================
   Start server
   ================================================================ */
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[${SERVER_ID}] Backend server running on port ${PORT}`);
});