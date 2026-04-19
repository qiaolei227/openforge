import { describe, it, expect } from 'vitest';
import { DynamicDataService } from '../dynamic-data.service';

describe('DynamicDataService', () => {
  describe('stripToModelFields', () => {
    it('silently strips LOOKUP field values from write payload', () => {
      // Create a minimal instance with mocked dependencies to access the private method
      const mockService = {
        stripToModelFields: DynamicDataService.prototype['stripToModelFields'],
      };

      const fields = [
        { columnName: 'material_id', fieldType: 'REFERENCE' },
        { columnName: 'material_name', fieldType: 'LOOKUP' },
      ];
      const input = { material_id: 'mat_1', material_name: 'should_drop' };
      const result = mockService.stripToModelFields.call(mockService, input, fields, false);

      expect(result).toEqual({ material_id: 'mat_1' });
      expect(result.material_name).toBeUndefined();
    });
  });
});
