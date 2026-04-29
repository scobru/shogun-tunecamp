import { jest } from '@jest/globals';

export default {
    watch: jest.fn().mockReturnValue({
        on: jest.fn().mockReturnThis(),
        close: jest.fn().mockImplementation(async () => {}),
    })
};
