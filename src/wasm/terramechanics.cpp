#include <cmath>
#include <cstring>
#include <cstdio>
#include <emscripten.h>

struct SoilParams {
    double phi;
    double c;
    double k_c;
    double k_phi;
    double K;
    double rho;
    double n;
};

struct WheelParams {
    double radius;
    double width;
    double openRatio;
    double load;
};

struct WheelState {
    double sinkage;
    double drawbarPull;
    double slipRatio;
    double motionResistance;
    double contactPressure;
    double torqueAllocation;
    double angularVelocity;
    double groundSpeed;
};

struct WheelCondition {
    int wheelIndex;
    double slipRatio;
    int gripStatus;
    double tractionAvailable;
    double torqueRequested;
    double torqueActual;
    int excessConsecutiveFrames;
};

struct AxlePair {
    int leftIndex;
    int rightIndex;
    double leftSlip;
    double rightSlip;
    double leftTorque;
    double rightTorque;
    double torqueTransferAmount;
    int torqueTransferDirection;
    int lockEngaged;
};

struct DiffLockConfig {
    int enabled;
    double slipThreshold;
    int consecutiveFramesToLock;
    double torqueTransferRate;
    double warningThreshold;
    double maxTorqueRatio;
    double smoothingFactor;
};

static const int MAX_WHEELS = 6;
static const int MAX_RESOLUTION = 256;
static const double BASE_TORQUE = 2.5;

static SoilParams g_soil = {0.63, 170.0, 1400.0, 820000.0, 0.018, 1550.0, 1.0};
static WheelParams g_wheels[MAX_WHEELS];
static WheelState g_wheelStates[MAX_WHEELS];
static int g_numWheels = 6;
static int g_resolution = 128;
static float g_heightData[MAX_RESOLUTION * MAX_RESOLUTION];
static float g_rutBuffer[MAX_RESOLUTION * MAX_RESOLUTION];
static float g_rutAccumulator[MAX_RESOLUTION * MAX_RESOLUTION];
static double g_roverX = 0;
static double g_roverZ = 0;
static double g_roverHeading = 0;

static DiffLockConfig g_diffLock = {1, 0.40, 3, 0.85, 0.25, 0.15, 0.3};
static double g_consecutiveExcess[MAX_WHEELS] = {0};
static double g_torqueAllocations[MAX_WHEELS] = {BASE_TORQUE, BASE_TORQUE, BASE_TORQUE, BASE_TORQUE, BASE_TORQUE, BASE_TORQUE};
static double g_smoothedTorque[MAX_WHEELS] = {BASE_TORQUE, BASE_TORQUE, BASE_TORQUE, BASE_TORQUE, BASE_TORQUE, BASE_TORQUE};
static double g_roverSpeed = 0;
static double g_targetSpeed = 0;

extern "C" {

EMSCRIPTEN_KEEPALIVE
void init(int terrainWidth, int terrainDepth, int resolution, float* heightData, int heightDataLen) {
    g_resolution = resolution;
    memcpy(g_heightData, heightData, heightDataLen * sizeof(float));
    memset(g_rutBuffer, 0, sizeof(g_rutBuffer));
    memset(g_rutAccumulator, 0, sizeof(g_rutAccumulator));
    g_roverX = 0;
    g_roverZ = 0;
    g_roverHeading = 0;
    g_roverSpeed = 0;
    g_targetSpeed = 0;
    for (int i = 0; i < MAX_WHEELS; i++) {
        g_wheelStates[i] = {0, 0, 0, 0, 0, BASE_TORQUE, 0, 0};
        g_wheels[i] = {0.15, 0.12, 0.30, 55.0};
        g_consecutiveExcess[i] = 0;
        g_torqueAllocations[i] = BASE_TORQUE;
        g_smoothedTorque[i] = BASE_TORQUE;
    }
}

EMSCRIPTEN_KEEPALIVE
void setSoilParams(double phi, double c, double k_c, double k_phi, double K, double rho, double n) {
    g_soil = {phi, c, k_c, k_phi, K, rho, n};
}

EMSCRIPTEN_KEEPALIVE
void setWheelParams(int index, double radius, double width, double openRatio, double load) {
    if (index >= 0 && index < MAX_WHEELS) {
        g_wheels[index] = {radius, width, openRatio, load};
    }
}

static double computeSlipRatio(int wheelIndex, double sinkage, double r, double roverSpeed) {
    double torqueFrac = g_torqueAllocations[wheelIndex] / BASE_TORQUE;
    double targetOmega = (g_targetSpeed / fmax(r, 0.01)) * torqueFrac;
    double absGroundSpeed = fabs(roverSpeed);

    if (absGroundSpeed < 0.005 && fabs(targetOmega) < 0.01) return 0.001;

    double wheelLinearSpeed = fabs(targetOmega) * r;

    if (wheelLinearSpeed < 1e-6 && absGroundSpeed < 1e-6) return 0.001;

    double denom = fmax(fmax(wheelLinearSpeed, absGroundSpeed), 1e-6);
    double slip;
    if (wheelLinearSpeed > absGroundSpeed) {
        slip = (wheelLinearSpeed - absGroundSpeed) / denom;
    } else {
        slip = (absGroundSpeed - wheelLinearSpeed) / denom;
    }

    double sinkageFactor = 0.02 + 0.18 * fmin(sinkage / (r * 0.20), 1.0);
    slip = fmax(slip * 0.70 + sinkageFactor * 0.30, 0.001);
    slip = fmin(slip, 0.95);

    return slip;
}

static void runDiffLockController(double slipRatios[]) {
    if (!g_diffLock.enabled) {
        for (int i = 0; i < MAX_WHEELS; i++) {
            g_torqueAllocations[i] = BASE_TORQUE;
            g_smoothedTorque[i] = BASE_TORQUE;
        }
        return;
    }

    int gripStatus[MAX_WHEELS];
    for (int i = 0; i < MAX_WHEELS; i++) {
        double slip = slipRatios[i];
        double prevExcess = g_consecutiveExcess[i];

        if (slip >= g_diffLock.slipThreshold) {
            g_consecutiveExcess[i] = prevExcess + 1;
        } else if (slip >= g_diffLock.warningThreshold) {
            g_consecutiveExcess[i] = fmax(0, prevExcess - 0.5);
        } else {
            g_consecutiveExcess[i] = fmax(0, prevExcess - 2);
        }

        int excessFrames = (int)floor(g_consecutiveExcess[i]);
        if (excessFrames >= g_diffLock.consecutiveFramesToLock) {
            gripStatus[i] = 3;
        } else if (excessFrames >= 1) {
            gripStatus[i] = 2;
        } else if (slip >= g_diffLock.warningThreshold) {
            gripStatus[i] = 1;
        } else {
            gripStatus[i] = 0;
        }
    }

    int axleIndices[3][2] = {{0, 1}, {2, 3}, {4, 5}};
    for (int a = 0; a < 3; a++) {
        int li = axleIndices[a][0];
        int ri = axleIndices[a][1];
        int leftSpinning = (gripStatus[li] >= 2);
        int rightSpinning = (gripStatus[ri] >= 2);

        if (leftSpinning && !rightSpinning) {
            double excessFraction = fmin(1.0, (slipRatios[li] - g_diffLock.slipThreshold) / g_diffLock.slipThreshold);
            double transferAmount = BASE_TORQUE * g_diffLock.torqueTransferRate * excessFraction;
            g_torqueAllocations[li] = BASE_TORQUE * fmax(g_diffLock.maxTorqueRatio, 1 - g_diffLock.torqueTransferRate * excessFraction);
            g_torqueAllocations[ri] = BASE_TORQUE + transferAmount;
        } else if (rightSpinning && !leftSpinning) {
            double excessFraction = fmin(1.0, (slipRatios[ri] - g_diffLock.slipThreshold) / g_diffLock.slipThreshold);
            double transferAmount = BASE_TORQUE * g_diffLock.torqueTransferRate * excessFraction;
            g_torqueAllocations[ri] = BASE_TORQUE * fmax(g_diffLock.maxTorqueRatio, 1 - g_diffLock.torqueTransferRate * excessFraction);
            g_torqueAllocations[li] = BASE_TORQUE + transferAmount;
        } else if (leftSpinning && rightSpinning) {
            double avgSlip = (slipRatios[li] + slipRatios[ri]) / 2.0;
            double reductionFactor = fmax(0.3, 1 - avgSlip * 0.8);
            g_torqueAllocations[li] = BASE_TORQUE * reductionFactor;
            g_torqueAllocations[ri] = BASE_TORQUE * reductionFactor;
        } else {
            double alpha = 0.15;
            g_torqueAllocations[li] = g_torqueAllocations[li] * (1 - alpha) + BASE_TORQUE * alpha;
            g_torqueAllocations[ri] = g_torqueAllocations[ri] * (1 - alpha) + BASE_TORQUE * alpha;
        }
    }

    for (int i = 0; i < MAX_WHEELS; i++) {
        g_smoothedTorque[i] = g_smoothedTorque[i] * (1 - g_diffLock.smoothingFactor) + g_torqueAllocations[i] * g_diffLock.smoothingFactor;
    }
}

EMSCRIPTEN_KEEPALIVE
void step(double dt, double roverX, double roverZ, double roverHeading, double roverSpeed, double targetSpeed,
          double* outSinkage, double* outDrawbarPull, double* outSlipRatio, double* outMotionResistance,
          double* outContactPressure, float* outRutBuffer) {
    g_roverX = roverX;
    g_roverZ = roverZ;
    g_roverHeading = roverHeading;
    g_roverSpeed = roverSpeed;
    g_targetSpeed = targetSpeed;

    double wheelOffsets[MAX_WHEELS][2] = {
        {-0.30, -0.35}, {-0.30, 0.35},
        { 0.00, -0.40}, { 0.00, 0.40},
        { 0.30, -0.35}, { 0.30, 0.35}
    };

    double rawSlipRatios[MAX_WHEELS] = {0};

    for (int i = 0; i < MAX_WHEELS; i++) {
        double cosH = cos(roverHeading);
        double sinH = sin(roverHeading);
        double wx = roverX + wheelOffsets[i][0] * cosH - wheelOffsets[i][1] * sinH;
        double wz = roverZ + wheelOffsets[i][0] * sinH + wheelOffsets[i][1] * cosH;

        double W = g_wheels[i].load;
        double b = g_wheels[i].width;
        double r = g_wheels[i].radius;
        double openRatio = g_wheels[i].openRatio;
        double effectiveB = b * (1.0 - openRatio * 0.45);

        double k_eq = g_soil.k_c / b + g_soil.k_phi;
        if (k_eq <= 0 || W <= 0) {
            g_wheelStates[i] = {0, 0, 0, 0, 0, BASE_TORQUE, 0, 0};
            continue;
        }

        double theta_f;
        if (r <= 0) theta_f = 0.3;
        else {
            double A = W / (b * k_eq * pow(r, g_soil.n + 1));
            double theta_candidate = pow(A * (g_soil.n + 1), 1.0 / (g_soil.n + 2));
            theta_f = fmin(0.8, fmax(0.005, theta_candidate));
        }

        double max_sinkage = r * 0.25;
        double z = fmin(r * (1 - cos(theta_f)), max_sinkage);

        for (int iter = 0; iter < 20; iter++) {
            double arg = 1.0 - fmin(z, r * 0.99) / r;
            if (arg < -1.0) arg = -1.0;
            if (arg > 1.0) arg = 1.0;
            double theta = acos(arg);
            double L_curr = r * sin(theta);
            if (L_curr <= 0.001) { z = fmin(z * 1.2, max_sinkage); continue; }

            double denom = b * L_curr * k_eq;
            if (denom <= 0) break;

            double z_new = pow(W / denom, 1.0 / fmax(0.3, g_soil.n));
            double delta = fabs(z_new - z);
            double omega = 0.5 + 0.1 * iter;
            z = z + omega * (z_new - z);
            if (z > max_sinkage) z = max_sinkage;
            if (z < 0) z = 0;
            if (delta < 1e-7) break;
        }

        double arg = 1.0 - fmin(z, r * 0.99) / r;
        if (arg < -1.0) arg = -1.0;
        if (arg > 1.0) arg = 1.0;
        double theta_final = acos(arg);
        double L = r * sin(theta_final);
        double A_contact = fmax(0.0001, effectiveB * L);
        double p = W / A_contact;

        double slipRatio = computeSlipRatio(i, z, r, roverSpeed);
        rawSlipRatios[i] = slipRatio;

        double tau_max = g_soil.c + p * tan(g_soil.phi);
        double H_max = tau_max * A_contact;

        double drawbarPull = 0;
        if (fabs(roverSpeed) > 0.005) {
            double j = slipRatio * L;
            double tau = tau_max * (1.0 - exp(-fmax(1e-6, j) / g_soil.K));
            double H = tau * A_contact;

            double R_c = (b * k_eq * pow(z, g_soil.n + 1)) / (g_soil.n + 1);
            double F_cohesion = (g_soil.n - 1 > 0) ? (g_soil.n - 1) * b * g_soil.c * z * z * 0.5 : 0;
            R_c = (R_c + F_cohesion) / fmax(z, 1e-6) * 0.015;

            double R_b = 0;
            if (z > 1e-5) {
                double phi = g_soil.phi;
                double tanPhi = tan(phi);
                double N_c = (M_PI + 2) * exp(M_PI * tanPhi) * tanPhi / (1 + sin(phi));
                double N_gamma = 2 * (N_c + 1) * tanPhi * sin(phi);
                double gamma = g_soil.rho * 1.62;
                R_b = (g_soil.c * N_c + 0.5 * gamma * z * N_gamma) * b * z * 0.35;
                R_b = fmax(0, R_b);
            }
            double R_total = fmax(0.5, R_c + R_b);
            drawbarPull = H - R_total;
        } else {
            double R_c = (b * k_eq * pow(z, g_soil.n + 1)) / (g_soil.n + 1);
            double F_cohesion = (g_soil.n - 1 > 0) ? (g_soil.n - 1) * b * g_soil.c * z * z * 0.5 : 0;
            R_c = (R_c + F_cohesion) / fmax(z, 1e-6) * 0.015;
            double R_b = 0;
            if (z > 1e-5) {
                double phi = g_soil.phi;
                double tanPhi = tan(phi);
                double N_c = (M_PI + 2) * exp(M_PI * tanPhi) * tanPhi / (1 + sin(phi));
                double N_gamma = 2 * (N_c + 1) * tanPhi * sin(phi);
                double gamma = g_soil.rho * 1.62;
                R_b = (g_soil.c * N_c + 0.5 * gamma * z * N_gamma) * b * z * 0.35;
                R_b = fmax(0, R_b);
            }
            double R_total = fmax(0.5, R_c + R_b);
            drawbarPull = fmax(0, H_max * 0.15 - R_total);
        }

        double torqueFrac = g_smoothedTorque[i] / BASE_TORQUE;
        g_wheelStates[i].sinkage = z;
        g_wheelStates[i].drawbarPull = drawbarPull * torqueFrac;
        g_wheelStates[i].slipRatio = slipRatio;
        g_wheelStates[i].motionResistance = fmax(0.5, R_c + R_b);
        g_wheelStates[i].contactPressure = p;
        g_wheelStates[i].torqueAllocation = g_smoothedTorque[i];
        g_wheelStates[i].angularVelocity = (roverSpeed / fmax(r, 0.01)) * torqueFrac;
        g_wheelStates[i].groundSpeed = roverSpeed;

        if (z > 0.0005) {
            int res = g_resolution;
            double cellSize = 20.0 / res;
            double halfWidth = effectiveB * 0.8;
            int radiusCells = fmax(2, (int)ceil(halfWidth / cellSize) + 1);
            double halfW = 10.0;
            double cx = (wx + halfW) / 20.0 * (res - 1);
            double cz = (wz + halfW) / 20.0 * (res - 1);
            int cx0 = (int)floor(cx);
            int cz0 = (int)floor(cz);

            for (int dz = -radiusCells; dz <= radiusCells; dz++) {
                int pz = cz0 + dz;
                if (pz < 0 || pz >= res) continue;
                double zFrac = cz0 + dz + 0.5 - cz;
                double zDistSq = zFrac * zFrac;
                for (int ddx = -radiusCells; ddx <= radiusCells; ddx++) {
                    int px = cx0 + ddx;
                    if (px < 0 || px >= res) continue;
                    double xFrac = cx0 + ddx + 0.5 - cx;
                    double dist = sqrt(xFrac * xFrac + zDistSq) / (double)radiusCells;
                    if (dist > 1.0) continue;
                    double falloff = (1.0 - dist * dist) * (1.0 - dist * dist);
                    double depression = z * falloff * 0.7;
                    int idx = pz * res + px;
                    g_rutAccumulator[idx] += depression;
                }
            }
        }

        outSinkage[i] = g_wheelStates[i].sinkage;
        outDrawbarPull[i] = g_wheelStates[i].drawbarPull;
        outSlipRatio[i] = g_wheelStates[i].slipRatio;
        outMotionResistance[i] = g_wheelStates[i].motionResistance;
        outContactPressure[i] = g_wheelStates[i].contactPressure;
    }

    runDiffLockController(rawSlipRatios);

    memcpy(g_rutBuffer, g_rutAccumulator, g_resolution * g_resolution * sizeof(float));
    memset(g_rutAccumulator, 0, g_resolution * g_resolution * sizeof(float));
    memcpy(outRutBuffer, g_rutBuffer, g_resolution * g_resolution * sizeof(float));
}

EMSCRIPTEN_KEEPALIVE
void reset() {
    memset(g_rutBuffer, 0, sizeof(g_rutBuffer));
    memset(g_rutAccumulator, 0, sizeof(g_rutAccumulator));
    for (int i = 0; i < MAX_WHEELS; i++) {
        g_wheelStates[i] = {0, 0, 0, 0, 0, BASE_TORQUE, 0, 0};
        g_consecutiveExcess[i] = 0;
        g_torqueAllocations[i] = BASE_TORQUE;
        g_smoothedTorque[i] = BASE_TORQUE;
    }
    g_roverSpeed = 0;
    g_targetSpeed = 0;
}

}
