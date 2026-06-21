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
};

static const int MAX_WHEELS = 6;
static const int MAX_RESOLUTION = 256;

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
    for (int i = 0; i < MAX_WHEELS; i++) {
        g_wheelStates[i] = {0, 0, 0, 0, 0};
        g_wheels[i] = {0.15, 0.12, 0.30, 55.0};
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

EMSCRIPTEN_KEEPALIVE
void step(double dt, double roverX, double roverZ, double roverHeading, double roverSpeed,
          double* outSinkage, double* outDrawbarPull, double* outSlipRatio, double* outMotionResistance,
          double* outContactPressure, float* outRutBuffer) {
    g_roverX = roverX;
    g_roverZ = roverZ;
    g_roverHeading = roverHeading;

    double wheelOffsets[MAX_WHEELS][2] = {
        {-0.30, -0.35}, {-0.30, 0.35},
        { 0.00, -0.40}, { 0.00, 0.40},
        { 0.30, -0.35}, { 0.30, 0.35}
    };

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
            g_wheelStates[i] = {0, 0, 0, 0, 0};
            continue;
        }

        double theta_f;
        if (r <= 0) theta_f = 0.3;
        else {
            double A = W / (b * k_eq * pow(r, g_soil.n + 1));
            double theta_candidate = pow(A * (g_soil.n + 1), 1.0 / (g_soil.n + 2));
            theta_f = fmin(0.6, fmax(0.02, theta_candidate));
        }

        double max_sinkage = r * 0.4;
        double z = fmin(r * theta_f * theta_f / 2.0, max_sinkage);

        for (int iter = 0; iter < 15; iter++) {
            double arg = 1.0 - z / r;
            if (arg < -1.0) arg = -1.0;
            if (arg > 1.0) arg = 1.0;
            double theta = acos(arg);
            double L_curr = r * sin(theta);
            if (L_curr <= 0.001) break;

            double denom = b * L_curr * k_eq;
            if (denom <= 0) break;

            double z_new = pow(W / denom, 1.0 / g_soil.n);
            double delta = fabs(z_new - z);
            z = z + 0.6 * (z_new - z);
            if (z > max_sinkage) z = max_sinkage;
            if (z < 0) z = 0;
            if (delta < 0.000001) break;
        }

        double arg = 1.0 - z / r;
        if (arg < -1.0) arg = -1.0;
        if (arg > 1.0) arg = 1.0;
        double theta_final = acos(arg);
        double L = r * sin(theta_final);
        double A_contact = fmax(0.0001, effectiveB * L);
        double p = W / A_contact;

        double slipRatio;
        double drawbarPull;

        if (fabs(roverSpeed) > 0.01) {
            slipRatio = 0.08 + 0.12 * fmin(z / (r * 0.25), 1.0);
            slipRatio = fmax(0.02, fmin(0.5, slipRatio));

            double tau_max = g_soil.c + p * tan(g_soil.phi);
            double j = slipRatio * L;
            double tau = tau_max * (1.0 - exp(-fmax(0.0001, j) / g_soil.K));
            double H = tau * A_contact;

            double R_c = (b * k_eq * pow(z, g_soil.n + 1)) / (g_soil.n + 1) + (g_soil.n - 1) * b * g_soil.c * z * z;

            double R_b = 0;
            if (z > 0.001) {
                double phi = g_soil.phi;
                double gamma = g_soil.rho * 1.62;
                double N_gamma = pow(tan(phi + 0.785), 4) - 1.0;
                double N_c = (N_gamma + 1.0) * (1.0 / tan(phi));
                R_b = (g_soil.c * N_c + 0.5 * gamma * z * N_gamma) * b * z * 0.3;
            }
            double R_total = R_c + R_b;

            drawbarPull = H - R_total;

            g_wheelStates[i].sinkage = z;
            g_wheelStates[i].drawbarPull = drawbarPull;
            g_wheelStates[i].slipRatio = slipRatio;
            g_wheelStates[i].motionResistance = R_total;
            g_wheelStates[i].contactPressure = p;
        } else {
            slipRatio = 0;
            double tau_max = g_soil.c + p * tan(g_soil.phi);
            double H_max = tau_max * A_contact;
            double R_c = (b * k_eq * pow(z, g_soil.n + 1)) / (g_soil.n + 1) + (g_soil.n - 1) * b * g_soil.c * z * z;

            double R_b = 0;
            if (z > 0.001) {
                double phi = g_soil.phi;
                double gamma = g_soil.rho * 1.62;
                double N_gamma = pow(tan(phi + 0.785), 4) - 1.0;
                double N_c = (N_gamma + 1.0) * (1.0 / tan(phi));
                R_b = (g_soil.c * N_c + 0.5 * gamma * z * N_gamma) * b * z * 0.3;
            }
            double R_total = R_c + R_b;

            g_wheelStates[i].sinkage = z;
            g_wheelStates[i].drawbarPull = H_max * 0.5 - R_total;
            g_wheelStates[i].slipRatio = 0;
            g_wheelStates[i].motionResistance = R_total;
            g_wheelStates[i].contactPressure = p;
        }

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

    memcpy(g_rutBuffer, g_rutAccumulator, g_resolution * g_resolution * sizeof(float));
    memset(g_rutAccumulator, 0, g_resolution * g_resolution * sizeof(float));
    memcpy(outRutBuffer, g_rutBuffer, g_resolution * g_resolution * sizeof(float));
}

EMSCRIPTEN_KEEPALIVE
void reset() {
    memset(g_rutBuffer, 0, sizeof(g_rutBuffer));
    memset(g_rutAccumulator, 0, sizeof(g_rutAccumulator));
    for (int i = 0; i < MAX_WHEELS; i++) {
        g_wheelStates[i] = {0, 0, 0, 0, 0};
    }
}

}
